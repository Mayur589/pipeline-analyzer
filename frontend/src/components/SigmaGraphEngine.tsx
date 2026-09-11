import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { SigmaContainer, useSigma, useRegisterEvents, useSetSettings } from '@react-sigma/core';
import '@react-sigma/core/lib/style.css';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import EdgeCurveProgram, { createDrawCurvedEdgeLabel, DEFAULT_EDGE_CURVE_PROGRAM_OPTIONS } from '@sigma/edge-curve';
import type { Settings } from 'sigma/settings';
import type { NodeLabelDrawingFunction, NodeHoverDrawingFunction } from 'sigma/rendering';
import { useGraphStore } from '../store/graphStore';
import { getProperty, createDefaultProperties } from '../types/graph';
import { RELATIONSHIPS_BY_ID, getRelationshipColor, getValidRelationships } from '../mock-api/relationships';
import { Maximize2, RefreshCw, ZoomIn, ZoomOut, Link2 } from 'lucide-react';

// Convert hex color to rgba with specific alpha
function hexToRgba(hex: string, alpha: number): string {
  if (!hex) return `rgba(6, 182, 212, ${alpha})`;
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) {
    return hex;
  }
  const clean = hex.replace('#', '');
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(6, 182, 212, ${alpha})`;
}

// Obsidian-like Node Label Rendering: Crisp white text below the node + selection ring
const drawObsidianNodeLabel: NodeLabelDrawingFunction = (context, data, settings) => {
  if (!data.label || data.hidden) return;

  const size = settings.labelSize || 12;
  const font = settings.labelFont || 'Inter, system-ui, sans-serif';
  const weight = data.highlighted ? '600' : '500';

  // Selection border ring
  if (data.highlighted) {
    context.beginPath();
    context.arc(data.x, data.y, data.size + 4, 0, Math.PI * 2);
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.stroke();
  }

  // Label text centered below node
  context.fillStyle = data.highlighted
    ? '#ffffff'
    : data.color && data.color.includes('0.15')
    ? 'rgba(241, 245, 249, 0.2)'
    : '#f8fafc';
  context.font = `${weight} ${size}px ${font}`;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillText(data.label, data.x, data.y + data.size + 5);
};

// Obsidian-like Node Hover Rendering: Subtle ring without heavy background boxes
const drawObsidianNodeHover: NodeHoverDrawingFunction = (context, data, settings) => {
  if (!data.label) return;

  // Hover ring
  context.beginPath();
  context.arc(data.x, data.y, data.size + 3, 0, Math.PI * 2);
  context.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  context.lineWidth = 1.5;
  context.stroke();

  // Label
  const size = settings.labelSize || 12;
  const font = settings.labelFont || 'Inter, system-ui, sans-serif';
  context.fillStyle = '#ffffff';
  context.font = `600 ${size}px ${font}`;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillText(data.label, data.x, data.y + data.size + 5);
};

// Internal Controller Component running inside SigmaContainer context
interface ControllerProps {
  onSigmaReady: (sigmaInstance: any) => void;
  hoveredNode: string | null;
  setHoveredNode: (node: string | null) => void;
  connectSourceId: string | null;
  setConnectSourceId: (node: string | null) => void;
}

const SigmaGraphController: React.FC<ControllerProps> = ({
  onSigmaReady,
  hoveredNode,
  setHoveredNode,
  connectSourceId,
  setConnectSourceId
}) => {
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();
  const setSettings = useSetSettings();

  const {
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    selectNode,
    selectEdge,
    clearSelection,
    addEdge,
    updateNodePosition,
    nodeCategories
  } = useGraphStore();

  const draggedNodeRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);
  const isInitialLayoutDoneRef = useRef(false);

  // Notify parent of sigma instance
  useEffect(() => {
    onSigmaReady(sigma);
  }, [sigma, onSigmaReady]);

  // ForceAtlas2 Animated Stabilization Loop
  const runForceAtlas2 = useCallback(
    (frames = 50) => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      const graph = sigma.getGraph();
      if (graph.order === 0) return;

      let currentFrame = 0;
      const step = () => {
        if (currentFrame < frames && !draggedNodeRef.current) {
          try {
            forceAtlas2.assign(graph, {
              iterations: 2,
              settings: {
                gravity: 0.8,
                scalingRatio: 28,
                barnesHutOptimize: true,
                adjustSizes: true,
                slowDown: 3.5,
                outboundAttractionDistribution: true
              }
            });
            sigma.refresh({ skipIndexation: true });
          } catch (err) {
            console.warn('ForceAtlas2 step error:', err);
          }
          currentFrame++;
          animFrameRef.current = requestAnimationFrame(step);
        }
      };
      animFrameRef.current = requestAnimationFrame(step);
    },
    [sigma]
  );

  // Synchronize Zustand nodes & edges into Graphology graph
  useEffect(() => {
    const graph = sigma.getGraph();
    let hasGraphStructureChanged = false;

    // 1. Sync Nodes
    const activeNodeIds = new Set(nodes.map((n) => n.id));

    // Remove deleted nodes
    graph.forEachNode((nodeId) => {
      if (!activeNodeIds.has(nodeId)) {
        graph.dropNode(nodeId);
        hasGraphStructureChanged = true;
      }
    });

    // Add or update nodes
    nodes.forEach((n, idx) => {
      const cat = nodeCategories.find((c) => c.id === n.categoryId);
      const catColor = cat?.color || '#06b6d4';
      const label = getProperty(n.properties, 'name') || n.id;
      const nodeSize = Math.max(12, Math.min(20, 10 + label.length * 0.45));

      if (graph.hasNode(n.id)) {
        // Update attributes if changed
        if (graph.getNodeAttribute(n.id, 'label') !== label) {
          graph.setNodeAttribute(n.id, 'label', label);
        }
        if (graph.getNodeAttribute(n.id, 'color') !== catColor) {
          graph.setNodeAttribute(n.id, 'color', catColor);
        }
        if (graph.getNodeAttribute(n.id, 'size') !== nodeSize) {
          graph.setNodeAttribute(n.id, 'size', nodeSize);
        }
      } else {
        // Position newly created nodes
        const angle = (idx / Math.max(1, nodes.length)) * Math.PI * 2;
        const radius = 80 + Math.random() * 40;
        const x = n.position ? n.position.x : Math.cos(angle) * radius;
        const y = n.position ? n.position.y : Math.sin(angle) * radius;

        graph.addNode(n.id, {
          x,
          y,
          size: nodeSize,
          label,
          color: catColor,
          categoryId: n.categoryId
        });
        hasGraphStructureChanged = true;
      }
    });

    // 2. Sync Edges
    const activeEdgeIds = new Set(edges.map((e) => e.id));

    // Remove deleted edges
    graph.forEachEdge((edgeId) => {
      if (!activeEdgeIds.has(edgeId)) {
        graph.dropEdge(edgeId);
        hasGraphStructureChanged = true;
      }
    });

    // Add or update edges
    edges.forEach((e) => {
      if (!graph.hasNode(e.sourceNodeId) || !graph.hasNode(e.targetNodeId)) {
        return;
      }

      const relDef = RELATIONSHIPS_BY_ID[e.relationshipId];
      const label = relDef?.label || e.relationshipId;
      const relColor = getRelationshipColor(e.relationshipId);

      if (graph.hasEdge(e.id)) {
        if (graph.getEdgeAttribute(e.id, 'relationshipId') !== e.relationshipId) {
          graph.setEdgeAttribute(e.id, 'relationshipId', e.relationshipId);
          graph.setEdgeAttribute(e.id, 'label', label);
          graph.setEdgeAttribute(e.id, 'color', hexToRgba(relColor, 0.45));
        }
      } else {
        graph.addEdgeWithKey(e.id, e.sourceNodeId, e.targetNodeId, {
          relationshipId: e.relationshipId,
          label: label,
          type: 'curve',
          size: 1.0,
          color: hexToRgba(relColor, 0.45)
        });
        hasGraphStructureChanged = true;
      }
    });

    sigma.refresh();

    // Run initial stabilization or on structural changes
    if (!isInitialLayoutDoneRef.current && nodes.length > 0) {
      isInitialLayoutDoneRef.current = true;
      runForceAtlas2(75);
    } else if (hasGraphStructureChanged) {
      runForceAtlas2(35);
    }
  }, [nodes, edges, nodeCategories, sigma, runForceAtlas2]);

  // Focus Mode Reducers: High performance WebGL opacity & highlighting
  useEffect(() => {
    const graph = sigma.getGraph();

    setSettings({
      nodeReducer: (nodeId, data) => {
        const res = { ...data };
        const baseColor = graph.hasNode(nodeId)
          ? graph.getNodeAttribute(nodeId, 'color') || '#06b6d4'
          : '#06b6d4';

        if (selectedNodeId) {
          const isSelected = nodeId === selectedNodeId;
          const isDirectNeighbor = graph.hasNode(selectedNodeId) && graph.areNeighbors(nodeId, selectedNodeId);

          if (isSelected || isDirectNeighbor) {
            res.highlighted = isSelected;
            res.color = baseColor;
            res.zIndex = isSelected ? 3 : 2;
            res.forceLabel = true;
          } else {
            // Unrelated nodes fade to 15% opacity
            res.color = hexToRgba(baseColor, 0.15);
            res.label = '';
            res.highlighted = false;
            res.zIndex = 0;
          }
        } else if (hoveredNode) {
          const isHovered = nodeId === hoveredNode;
          const isDirectNeighbor = graph.hasNode(hoveredNode) && graph.areNeighbors(nodeId, hoveredNode);

          if (isHovered || isDirectNeighbor) {
            res.highlighted = isHovered;
            res.color = baseColor;
            res.zIndex = isHovered ? 3 : 2;
            res.forceLabel = true;
          } else {
            res.color = hexToRgba(baseColor, 0.35);
            res.label = '';
            res.zIndex = 0;
          }
        } else {
          res.color = baseColor;
          res.highlighted = false;
          res.zIndex = 1;
        }

        return res;
      },

      edgeReducer: (edgeId, data) => {
        const res = { ...data };
        const isSelectedEdge = edgeId === selectedEdgeId;
        const source = graph.source(edgeId);
        const target = graph.target(edgeId);

        if (isSelectedEdge) {
          res.color = '#38bdf8'; // Bright cyan/blue
          res.size = 2.4;
          res.zIndex = 3;
        } else if (selectedNodeId) {
          const isConnectedToSelected = source === selectedNodeId || target === selectedNodeId;
          if (isConnectedToSelected) {
            res.color = 'rgba(255, 255, 255, 0.75)';
            res.size = 1.6;
            res.zIndex = 2;
          } else {
            // Unrelated edges fade to 5% opacity
            res.color = 'rgba(148, 163, 184, 0.05)';
            res.size = 0.6;
            res.zIndex = 0;
            res.label = null;
          }
        } else if (hoveredNode) {
          const isConnectedToHovered = source === hoveredNode || target === hoveredNode;
          if (isConnectedToHovered) {
            res.color = 'rgba(255, 255, 255, 0.65)';
            res.size = 1.4;
            res.zIndex = 2;
          } else {
            res.color = 'rgba(148, 163, 184, 0.1)';
            res.size = 0.6;
            res.zIndex = 0;
            res.label = null;
          }
        } else {
          res.color = 'rgba(148, 163, 184, 0.28)';
          res.size = 1.0;
          res.zIndex = 1;
        }

        // Hide relationship labels unless zoomed in or selected
        const cameraRatio = sigma.getCamera().getState().ratio;
        if (!isSelectedEdge && cameraRatio > 0.85) {
          res.label = null;
        }

        return res;
      }
    });

    sigma.refresh({ skipIndexation: true });
  }, [selectedNodeId, selectedEdgeId, hoveredNode, sigma, setSettings]);

  // Live Node Dragging Implementation
  useEffect(() => {
    const container = sigma.getContainer();
    const graph = sigma.getGraph();

    const handleMouseMove = (e: MouseEvent) => {
      if (!draggedNodeRef.current) return;
      isDraggingRef.current = true;

      const rect = container.getBoundingClientRect();
      const viewportX = e.clientX - rect.left;
      const viewportY = e.clientY - rect.top;
      const graphCoords = sigma.viewportToGraph({ x: viewportX, y: viewportY });

      if (graph.hasNode(draggedNodeRef.current)) {
        graph.setNodeAttribute(draggedNodeRef.current, 'x', graphCoords.x);
        graph.setNodeAttribute(draggedNodeRef.current, 'y', graphCoords.y);
        sigma.refresh({ skipIndexation: true });
      }
    };

    const handleMouseUp = () => {
      if (draggedNodeRef.current) {
        const nodeId = draggedNodeRef.current;
        if (graph.hasNode(nodeId)) {
          const x = graph.getNodeAttribute(nodeId, 'x');
          const y = graph.getNodeAttribute(nodeId, 'y');
          updateNodePosition(nodeId, { x, y });
        }
        draggedNodeRef.current = null;
        sigma.getCamera().enable();
      }
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 50);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [sigma, updateNodePosition]);

  // Register Sigma Interactive Events
  useEffect(() => {
    const graph = sigma.getGraph();

    registerEvents({
      downNode: (e) => {
        draggedNodeRef.current = e.node;
        sigma.getCamera().disable();
      },

      clickNode: (e) => {
        if (isDraggingRef.current) return;

        // Shift + Click or Connect Mode: Create connection between two nodes
        if ((e.event.original.shiftKey || connectSourceId) && (connectSourceId || selectedNodeId)) {
          const sourceId = connectSourceId || selectedNodeId;
          if (sourceId && sourceId !== e.node) {
            const srcNode = nodes.find((n) => n.id === sourceId);
            const tgtNode = nodes.find((n) => n.id === e.node);
            if (srcNode && tgtNode) {
              const valid = getValidRelationships(srcNode.categoryId, tgtNode.categoryId);
              if (valid.valid && valid.relationships.length > 0) {
                addEdge({
                  sourceNodeId: sourceId,
                  targetNodeId: e.node,
                  relationshipId: valid.relationships[0].id
                });
              }
            }
            setConnectSourceId(null);
            return;
          }
        }

        setConnectSourceId(null);
        selectNode(e.node);
      },

      doubleClickNode: (e) => {
        if (graph.hasNode(e.node)) {
          const x = graph.getNodeAttribute(e.node, 'x');
          const y = graph.getNodeAttribute(e.node, 'y');
          sigma.getCamera().animate({ x, y, ratio: 0.5 }, { duration: 400 });
        }
      },

      clickEdge: (e) => {
        setConnectSourceId(null);
        selectEdge(e.edge);
      },

      clickStage: () => {
        if (isDraggingRef.current) return;
        setConnectSourceId(null);
        clearSelection();
      },

      doubleClickStage: () => {
        sigma.getCamera().animatedReset({ duration: 400 });
      },

      enterNode: (e) => {
        setHoveredNode(e.node);
      },

      leaveNode: () => {
        setHoveredNode(null);
      }
    });
  }, [
    sigma,
    registerEvents,
    selectNode,
    selectEdge,
    clearSelection,
    addEdge,
    connectSourceId,
    selectedNodeId,
    setConnectSourceId,
    setHoveredNode,
    nodes
  ]);

  return null;
};

// Main Exported SigmaGraphEngine Component
export const SigmaGraphEngine: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<any>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);

  const {
    nodes,
    edges,
    selectedNodeId,
    addNode,
    selectNode,
    nodeCategories
  } = useGraphStore();

  // Handle Sigma instance readiness
  const handleSigmaReady = useCallback((instance: any) => {
    sigmaRef.current = instance;
  }, []);

  // Recalculate Force Layout manually
  const handleRecalculateLayout = useCallback(() => {
    if (!sigmaRef.current) return;
    const graph = sigmaRef.current.getGraph();
    if (graph.order === 0) return;

    let frame = 0;
    const animate = () => {
      if (frame < 60) {
        forceAtlas2.assign(graph, {
          iterations: 2,
          settings: {
            gravity: 0.8,
            scalingRatio: 28,
            barnesHutOptimize: true,
            adjustSizes: true,
            slowDown: 3.5,
            outboundAttractionDistribution: true
          }
        });
        sigmaRef.current.refresh({ skipIndexation: true });
        frame++;
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, []);

  // Camera zoom in/out/reset helpers
  const handleZoomIn = useCallback(() => {
    sigmaRef.current?.getCamera().animatedZoom({ duration: 300, factor: 1.4 });
  }, []);

  const handleZoomOut = useCallback(() => {
    sigmaRef.current?.getCamera().animatedUnzoom({ duration: 300, factor: 1.4 });
  }, []);

  const handleFitScreen = useCallback(() => {
    sigmaRef.current?.getCamera().animatedReset({ duration: 400 });
  }, []);

  // HTML5 Drag & Drop from left minimal sidebar
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const categoryId = e.dataTransfer.getData('application/pipelineguard-node');
      if (!categoryId) return;

      const container = containerRef.current;
      if (!container || !sigmaRef.current) return;

      const rect = container.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      // Unproject viewport screen coordinates into Graphology coordinates
      const graphCoords = sigmaRef.current.viewportToGraph({ x: clientX, y: clientY });

      const category = nodeCategories.find((c) => c.id === categoryId);
      const properties = category ? createDefaultProperties(category) : {};

      const createdNode = await addNode({
        categoryId,
        properties,
        position: graphCoords
      });

      // Immediately select the created node
      selectNode(createdNode.id);
    },
    [nodeCategories, addNode, selectNode]
  );

  // Sigma configuration settings matching Obsidian 1:1
  const sigmaSettings: Partial<Settings> = useMemo(
    () => ({
      renderLabels: true,
      renderEdgeLabels: true,
      enableEdgeEvents: true,
      defaultEdgeType: 'curve',
      edgeProgramClasses: {
        curve: EdgeCurveProgram
      },
      defaultDrawNodeLabel: drawObsidianNodeLabel,
      defaultDrawNodeHover: drawObsidianNodeHover,
      defaultDrawEdgeLabel: createDrawCurvedEdgeLabel({
        ...DEFAULT_EDGE_CURVE_PROGRAM_OPTIONS,
        keepLabelUpright: true
      }),
      labelFont: 'Inter, system-ui, -apple-system, sans-serif',
      labelSize: 12,
      labelWeight: '500',
      labelColor: { color: '#f8fafc' },
      labelRenderedSizeThreshold: 5,
      edgeLabelFont: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      edgeLabelSize: 10,
      edgeLabelWeight: '400',
      edgeLabelColor: { color: '#cbd5e1' },
      stagePadding: 35,
      zIndex: true,
      minCameraRatio: 0.1,
      maxCameraRatio: 3.5,
      enableCameraZooming: true,
      enableCameraPanning: true,
      enableCameraRotation: false
    }),
    []
  );

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="w-full h-full relative bg-[#0B1220] overflow-hidden select-none"
    >
      {/* Subtle Dot Grid Background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}
      />

      {/* Connect mode banner */}
      {connectSourceId && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 backdrop-blur-md text-cyan-200 text-xs shadow-lg animate-fade-in">
          <Link2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
          <span>Click any node to create relationship</span>
          <button
            onClick={() => setConnectSourceId(null)}
            className="ml-2 hover:text-white underline text-[11px]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* SigmaContainer hosting WebGL Canvas */}
      <SigmaContainer
        className="w-full h-full relative"
        style={{ backgroundColor: '#0B1220' }}
        settings={sigmaSettings}
      >
        <SigmaGraphController
          onSigmaReady={handleSigmaReady}
          hoveredNode={hoveredNode}
          setHoveredNode={setHoveredNode}
          connectSourceId={connectSourceId}
          setConnectSourceId={setConnectSourceId}
        />
      </SigmaContainer>

      {/* Floating Obsidian Graph Controls HUD */}
      <div className="absolute bottom-5 left-5 z-20 flex items-center gap-1.5 p-1 rounded-xl bg-[#0F172A]/85 backdrop-blur-md border border-white/10 shadow-2xl">
        <button
          onClick={handleZoomIn}
          title="Zoom In (+)"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          onClick={handleZoomOut}
          title="Zoom Out (-)"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-4 bg-white/10 my-auto" />

        <button
          onClick={handleFitScreen}
          title="Fit Screen (Double click canvas)"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <button
          onClick={handleRecalculateLayout}
          title="Recalculate ForceAtlas2 Layout"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {selectedNodeId && (
          <>
            <div className="w-[1px] h-4 bg-white/10 my-auto" />
            <button
              onClick={() => setConnectSourceId(selectedNodeId)}
              title="Connect to another node (or Shift+Click target)"
              className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs px-2 ${
                connectSourceId
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Connect</span>
            </button>
          </>
        )}

        <div className="w-[1px] h-4 bg-white/10 my-auto" />

        {/* Minimal Graph Statistics */}
        <div className="px-2.5 text-[11px] font-mono text-slate-400">
          <span className="text-slate-200 font-medium">{nodes.length}</span> nodes ·{' '}
          <span className="text-slate-200 font-medium">{edges.length}</span> links
        </div>
      </div>
    </div>
  );
};
