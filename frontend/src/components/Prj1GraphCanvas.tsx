import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useGraphStore } from '../store/graphStore';
import { GraphEngine } from '../engine/GraphEngine';
import { createSearchIndexer } from '../engine/search';
import type {
  GraphNode,
  GraphEdge,
  PhysicsConfig,
  DisplayConfig,
  FilterConfig,
  Node
} from '../types/graph';
import { getProperty, createDefaultProperties } from '../types/graph';
import {
  getRelationshipColor,
  getRelationshipGroupInfo,
  formatRelationshipLabel
} from '../types/graph';
import type { RelationshipDefinition } from '../types/graph';
import { validateRelationship } from '../api/client';
import {
  Maximize2,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Link2,
  Sliders,
  X,
  Sparkles,
  Layers,
  Search,
  Trash2,
  Palette,
  ImageOff,
  AlertTriangle,
  Check
} from 'lucide-react';

const DEFAULT_PHYSICS: PhysicsConfig = {
  repulsion: -380,
  linkDistance: 170,
  linkStrength: 0.7,
  gravity: 0.10,
  collisionRadius: 28,
  damping: 0.45,
  enabled: true
};

const DEFAULT_DISPLAY: DisplayConfig = {
  showLabels: true,
  labelSize: 12,
  linkThickness: 1.2,
  curvedEdges: true,
  showArrows: false,
  animateParticles: true,
  colorBy: 'type',
  nodeScale: 1.0,
  dimNonNeighbors: true,
  haloGlow: true
};

const DEFAULT_FILTER: FilterConfig = {
  searchQuery: '',
  selectedTags: [],
  selectedTypes: [],
  hideOrphans: false,
  minConnections: 0
};

export const Prj1GraphCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GraphEngine | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const [physicsConfig, setPhysicsConfig] = useState<PhysicsConfig>(DEFAULT_PHYSICS);
  const [displayConfig, setDisplayConfig] = useState<DisplayConfig>(DEFAULT_DISPLAY);
  const [filterConfig, setFilterConfig] = useState<FilterConfig>(DEFAULT_FILTER);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(true);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);

  const {
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    selectNode,
    selectEdge,
    clearSelection,
    addNode,
    removeNode,
    addEdge,
    updateNodeProperties,
    nodeCategories
  } = useGraphStore();

  // Convert PipelineGuard entities to GraphNode and GraphEdge with degree-based sizing
  const { graphNodes, graphEdges } = useMemo(() => {
    // Calculate connection count (degree) for each node
    const degreeMap = new Map<string, number>();
    edges.forEach((e) => {
      degreeMap.set(e.sourceNodeId, (degreeMap.get(e.sourceNodeId) || 0) + 1);
      degreeMap.set(e.targetNodeId, (degreeMap.get(e.targetNodeId) || 0) + 1);
    });

    const gNodes: GraphNode[] = nodes.map((n) => {
      const cat = nodeCategories.find((c) => c.id === n.categoryId);
      const rawName = getProperty(n.properties, 'name');
      const name = rawName !== undefined ? String(rawName) : n.id;
      const degree = degreeMap.get(n.id) || 0;
      // Dynamic node size based on number of connections (degree):
      // Base size 18px for isolated nodes, expanding up to 48px for central hub nodes
      const dynamicSize = Math.min(48, Math.max(18, 18 + degree * 5));

      const imageUrl = getProperty(n.properties, 'imageUrl') || (n as any).imageUrl || n.properties?.image;
      const nodeType = imageUrl ? 'image' : 'document';

      return {
        id: n.id,
        label: name,
        type: nodeType,
        tags: [cat?.category || 'General'],
        color: cat?.color || '#06b6d4',
        size: dynamicSize,
        x: n.position?.x,
        y: n.position?.y,
        metadata: {
          customFields: n.properties,
          imageUrl: imageUrl
        }
      };
    });

    const gEdges: GraphEdge[] = edges.map((e) => {
      const label = formatRelationshipLabel(e.relationshipId);
      const color = getRelationshipColor(e.relationshipId);

      return {
        id: e.id,
        source: e.sourceNodeId,
        target: e.targetNodeId,
        label,
        type: 'directional',
        weight: 1.5,
        color
      };
    });

    return { graphNodes: gNodes, graphEdges: gEdges };
  }, [nodes, edges, nodeCategories]);

  // Semantic Connection Picker & Toast State
  const [relationshipPicker, setRelationshipPicker] = useState<{
    sourceNode: Node;
    targetNode: Node;
    options: RelationshipDefinition[];
    selectedId: string;
  } | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<any>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  }, []);

  const [validationCache, setValidationCache] = useState<Map<string, boolean>>(new Map());

  const handleAttemptConnect = useCallback(
    async (sourceId: string, targetId: string) => {
      const src = nodes.find((n) => n.id === sourceId);
      const tgt = nodes.find((n) => n.id === targetId);
      if (!src || !tgt) return;

      try {
        const valid = await validateRelationship(src.categoryId, tgt.categoryId);

        if (!valid.valid || valid.allowedRelationshipIds.length === 0) {
          const srcCat = nodeCategories.find((c) => c.id === src.categoryId)?.category || src.categoryId;
          const tgtCat = nodeCategories.find((c) => c.id === tgt.categoryId)?.category || tgt.categoryId;
          showToast(`Invalid Connection: ${srcCat} cannot connect to ${tgtCat}.`);
          setConnectSourceId(null);
          setContextMenu(null);
          return;
        }

        const options: RelationshipDefinition[] = valid.allowedRelationshipIds.map((id) => ({
          id,
          label: formatRelationshipLabel(id)
        }));

        if (options.length === 1) {
          // Automatically connect if exactly 1 valid relationship
          callbacksRef.current.addEdge({
            sourceNodeId: sourceId,
            targetNodeId: targetId,
            relationshipId: options[0].id
          });
          setConnectSourceId(null);
          setContextMenu(null);
          if (workerRef.current) {
            workerRef.current.postMessage({ type: 'reheat' });
          }
          return;
        }

        // Multiple valid relationships: show picker modal
        setConnectSourceId(null);
        setContextMenu(null);
        setRelationshipPicker({
          sourceNode: src,
          targetNode: tgt,
          options,
          selectedId: options[0].id
        });
      } catch (err: any) {
        showToast(err.message || 'Failed to validate connection.');
        setConnectSourceId(null);
        setContextMenu(null);
      }
    },
    [nodes, nodeCategories, showToast]
  );

  const handleAttemptConnectRef = useRef(handleAttemptConnect);
  useEffect(() => {
    handleAttemptConnectRef.current = handleAttemptConnect;
  }, [handleAttemptConnect]);

  const validateConnectionFn = useCallback(
    (sourceId: string, targetId: string) => {
      const src = nodes.find((n) => n.id === sourceId);
      const tgt = nodes.find((n) => n.id === targetId);
      if (!src || !tgt) return { valid: false, count: 0 };
      const cacheKey = `${src.categoryId}->${tgt.categoryId}`;
      if (validationCache.has(cacheKey)) {
        const isValid = validationCache.get(cacheKey)!;
        return { valid: isValid, count: isValid ? 1 : 0 };
      }
      // Populate cache asynchronously
      validateRelationship(src.categoryId, tgt.categoryId)
        .then((res) => {
          setValidationCache((prev) => new Map(prev).set(cacheKey, res.valid));
        })
        .catch(console.error);

      // Default to allowed during drag until backend check resolves
      return { valid: true, count: 1 };
    },
    [nodes, validationCache]
  );

  const validateConnectionRef = useRef(validateConnectionFn);
  useEffect(() => {
    validateConnectionRef.current = validateConnectionFn;
    if (engineRef.current) {
      engineRef.current.setValidateConnection(validateConnectionFn);
    }
  }, [validateConnectionFn]);

  // Keep latest callbacks in ref to avoid re-initializing engine
  const callbacksRef = useRef({
    selectNode,
    selectEdge,
    clearSelection,
    addEdge,
    removeNode,
    connectSourceId,
    selectedNodeId
  });

  useEffect(() => {
    callbacksRef.current = {
      selectNode,
      selectEdge,
      clearSelection,
      addEdge,
      removeNode,
      connectSourceId,
      selectedNodeId
    };
  });

  const justOpenedMenuRef = useRef(false);

  // Dismiss menus on click outside or escape
  useEffect(() => {
    const handleDismiss = (e: MouseEvent) => {
      if (justOpenedMenuRef.current) {
        justOpenedMenuRef.current = false;
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest('.context-menu-popover')) {
        return;
      }
      setContextMenu(null);
    };
    window.addEventListener('click', handleDismiss);
    return () => window.removeEventListener('click', handleDismiss);
  }, []);

  // Initialize Web Worker and GraphEngine on mount
  useEffect(() => {
    if (!canvasRef.current) return;

    const worker = new Worker(new URL('../engine/physicsWorker.ts', import.meta.url), {
      type: 'module'
    });
    workerRef.current = worker;

    const engine = new GraphEngine(canvasRef.current, {
      onSelectNode: (id) => {
        setConnectSourceId(null);
        setContextMenu(null);
        if (id) {
          callbacksRef.current.selectNode(id);
        } else {
          callbacksRef.current.selectNode(null);
        }
      },
      onSelectEdge: (id) => {
        setConnectSourceId(null);
        setContextMenu(null);
        callbacksRef.current.selectEdge(id);
      },
      onHoverNode: (id) => setHoveredNodeId(id),
      onConnectNodes: (sourceId, targetId) => {
        handleAttemptConnectRef.current(sourceId, targetId);
      },
      validateConnection: (sourceId, targetId) => {
        return validateConnectionRef.current(sourceId, targetId);
      },
      onConnectCancel: () => {
        setConnectSourceId(null);
        setContextMenu(null);
      },
      onNodeContextMenu: (nodeId, clientX, clientY) => {
        if (nodeId) {
          justOpenedMenuRef.current = true;
          callbacksRef.current.selectNode(nodeId);
          setContextMenu({
            nodeId,
            x: clientX,
            y: clientY
          });
        } else {
          setContextMenu(null);
        }
      }
    });

    engine.initWorker(worker);
    engineRef.current = engine;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        engine.resize(width, height);
      }
    });

    if (canvasRef.current.parentElement) {
      resizeObserver.observe(canvasRef.current.parentElement);
    }

    engine.startRenderLoop();

    return () => {
      engine.stopRenderLoop();
      worker.terminate();
      resizeObserver.disconnect();
    };
  }, []);

  // Synchronize Graph Data & Web Worker Physics
  useEffect(() => {
    if (!engineRef.current || !workerRef.current) return;

    workerRef.current.postMessage({
      type: 'init',
      nodes: graphNodes,
      edges: graphEdges,
      config: physicsConfig
    });

    engineRef.current.updateData(graphNodes, graphEdges);
  }, [graphNodes, graphEdges, physicsConfig]);

  // Synchronize Physics Config
  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'updateConfig',
        config: physicsConfig
      });
    }
  }, [physicsConfig]);

  // Synchronize Connect Mode to Engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setConnectingSource(connectSourceId);
    }
  }, [connectSourceId]);

  // Synchronize Display and Search Configs
  useEffect(() => {
    if (!engineRef.current) return;

    const searchIndexer = createSearchIndexer(graphNodes);
    const searchResults = searchIndexer.search(filterConfig.searchQuery);

    engineRef.current.updateConfigs(
      displayConfig,
      filterConfig,
      searchResults,
      selectedNodeId,
      hoveredNodeId,
      selectedEdgeId
    );
  }, [graphNodes, displayConfig, filterConfig, selectedNodeId, hoveredNodeId, selectedEdgeId]);

  // Drag & Drop from left minimal sidebar
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const categoryId = e.dataTransfer.getData('application/pipelineguard-node');
      if (!categoryId) return;

      const canvas = canvasRef.current;
      const engine = engineRef.current;
      if (!canvas || !engine) return;

      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldPos = engine.screenToWorld(screenX, screenY);

      const category = nodeCategories.find((c) => c.id === categoryId);
      const properties = category ? createDefaultProperties(category) : {};

      const createdNode = await addNode({
        categoryId,
        properties,
        position: worldPos
      });

      selectNode(createdNode.id);

      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'reheat' });
      }
    },
    [nodeCategories, addNode, selectNode]
  );

  const handleReheat = () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'reheat' });
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative w-full h-full bg-[#090d16] overflow-hidden select-none"
    >
      {/* 60 FPS HTML5 Canvas Graph Engine */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-grab active:cursor-grabbing"
      />

      {/* Node Right-Click Context Menu */}
      {contextMenu && (() => {
        const menuNode = nodes.find((n) => n.id === contextMenu.nodeId);
        const cat = nodeCategories.find((c) => c.id === menuNode?.categoryId);
        const nodeName = menuNode
          ? getProperty(menuNode.properties, 'name') || menuNode.id
          : 'Node';

        return (
          <div
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 220),
              top: Math.min(contextMenu.y, window.innerHeight - 190)
            }}
            className="context-menu-popover fixed z-50 w-52 p-1.5 rounded-xl bg-[#0F172A]/95 backdrop-blur-xl border border-white/15 shadow-2xl text-xs space-y-1 animate-fade-in select-none"
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* Node Info Header */}
            <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-white/10 text-slate-300">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: cat?.color || '#06b6d4' }}
              />
              <span className="font-semibold text-slate-200 truncate">{nodeName}</span>
            </div>

            {/* Primary Action: Connect Here or Create Link */}
            {connectSourceId && connectSourceId !== contextMenu.nodeId ? (
              <button
                onClick={() => {
                  handleAttemptConnect(connectSourceId, contextMenu.nodeId);
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition-all font-semibold group text-left cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
                  <span>Connect with {nodeName}</span>
                </div>
                <span className="text-[10px] text-emerald-400/90 font-mono">Finish</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setConnectSourceId(contextMenu.nodeId);
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 transition-all font-medium group text-left cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
                  <span>Create Link</span>
                </div>
                <span className="text-[10px] text-cyan-400/80 font-mono">Connect</span>
              </button>
            )}

            {/* Center / Focus Node */}
            <button
              onClick={() => {
                engineRef.current?.centerOnNode(contextMenu.nodeId);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-slate-300 transition-colors text-left cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Center in View</span>
            </button>

            {/* Remove Image Option if node has an image */}
            {Boolean(menuNode?.properties && (menuNode.properties.imageUrl || menuNode.properties.image)) && (
              <button
                onClick={() => {
                  const updatedProps = { ...menuNode?.properties };
                  delete updatedProps.imageUrl;
                  delete updatedProps.image;
                  updateNodeProperties(contextMenu.nodeId, updatedProps);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-amber-500/15 text-amber-300 transition-colors text-left cursor-pointer"
              >
                <ImageOff className="w-3.5 h-3.5 text-amber-400" />
                <span>Remove Image</span>
              </button>
            )}

            {/* Delete Node */}
            <button
              onClick={() => {
                removeNode(contextMenu.nodeId);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/15 text-rose-400 transition-colors text-left cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Node</span>
            </button>
          </div>
        );
      })()}

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

      {/* Floating Color : Category Table Reference */}
      {isLegendOpen && (
        <div className="absolute bottom-16 left-5 z-20 w-80 p-3.5 rounded-2xl bg-[#0F172A]/95 backdrop-blur-xl border border-white/15 shadow-2xl space-y-2 animate-fade-in text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2 font-semibold text-slate-200">
              <Palette className="w-4 h-4 text-cyan-400" />
              <span>Color : Category Reference</span>
            </div>
            <button
              onClick={() => setIsLegendOpen(false)}
              className="p-1 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Close Reference"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1 custom-scrollbar pr-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] text-slate-500 uppercase tracking-wider border-b border-white/5">
                  <th className="pb-1 font-medium w-8">Color</th>
                  <th className="pb-1 font-medium">Category</th>
                  <th className="pb-1 font-medium text-right">Nodes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {nodeCategories.map((cat) => {
                  const count = nodes.filter((n) => n.categoryId === cat.id).length;
                  return (
                    <tr
                      key={cat.id}
                      onClick={() => {
                        const firstNode = nodes.find((n) => n.categoryId === cat.id);
                        if (firstNode) {
                          callbacksRef.current.selectNode(firstNode.id);
                          engineRef.current?.centerOnNode(firstNode.id);
                        }
                      }}
                      className="hover:bg-white/5 cursor-pointer rounded transition-colors group"
                      title={`Click to focus ${cat.category} nodes`}
                    >
                      <td className="py-1.5 pr-2">
                        <span
                          className="w-3.5 h-3.5 rounded-full inline-block shrink-0 shadow-sm transition-transform group-hover:scale-125"
                          style={{
                            backgroundColor: cat.color || '#06b6d4',
                            boxShadow: `0 0 8px ${cat.color || '#06b6d4'}80`
                          }}
                        />
                      </td>
                      <td className="py-1.5 text-slate-300 group-hover:text-cyan-300 truncate max-w-[140px] font-medium">
                        {cat.category}
                      </td>
                      <td className="py-1.5 text-right font-mono text-[10px]">
                        <span className={`px-1.5 py-0.5 rounded-full ${count > 0 ? 'bg-white/10 text-slate-200 font-semibold' : 'text-slate-600'}`}>
                          {count}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Floating Obsidian Graph Controls HUD */}
      <div className="absolute bottom-5 left-5 z-20 flex items-center gap-1.5 p-1 rounded-xl bg-[#0F172A]/85 backdrop-blur-md border border-white/10 shadow-2xl">
        <button
          onClick={() => engineRef.current?.zoomIn()}
          title="Zoom In (+)"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          onClick={() => engineRef.current?.zoomOut()}
          title="Zoom Out (-)"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-4 bg-white/10 my-auto" />

        <button
          onClick={() => engineRef.current?.centerCamera()}
          title="Center Camera (Double-click background)"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <button
          onClick={handleReheat}
          title="Reheat Physics Simulation"
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
              className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs px-2 ${connectSourceId
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

        <button
          onClick={() => setIsLegendOpen(!isLegendOpen)}
          title="Toggle Color : Category Table Reference"
          className={`p-1.5 rounded-lg transition-colors flex items-center gap-1.5 px-2 text-xs cursor-pointer ${isLegendOpen
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
            : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
        >
          <Palette className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-medium">Color : Cat</span>
        </button>

        <div className="w-[1px] h-4 bg-white/10 my-auto" />

        <button
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          title="Obsidian Graph Engine Settings"
          className={`p-1.5 rounded-lg transition-colors ${isSettingsOpen
            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
            : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
        >
          <Sliders className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-4 bg-white/10 my-auto" />

        {/* Minimal Graph Statistics */}
        <div className="px-2.5 text-[11px] font-mono text-slate-400">
          <span className="text-slate-200 font-medium">{nodes.length}</span> nodes ·{' '}
          <span className="text-slate-200 font-medium">{edges.length}</span> links
        </div>
      </div>

      {/* Obsidian Graph View Settings Drawer */}
      {isSettingsOpen && (
        <aside className="absolute top-5 left-5 z-30 w-72 p-4 rounded-xl bg-[#0F172A]/90 backdrop-blur-xl border border-white/10 shadow-2xl text-xs space-y-4 animate-fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2 font-medium text-slate-200">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>Graph Engine Settings</span>
            </div>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="p-1 rounded text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search Filter */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={filterConfig.searchQuery}
              onChange={(e) => setFilterConfig({ ...filterConfig, searchQuery: e.target.value })}
              placeholder="Search graph nodes..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-800/80 border border-white/10 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
            />
          </div>

          {/* Forces Section */}
          <div className="space-y-3">
            <div className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Physics Forces</span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Repulsion</span>
                <span className="font-mono">{physicsConfig.repulsion}</span>
              </div>
              <input
                type="range"
                min="-600"
                max="-30"
                step="10"
                value={physicsConfig.repulsion}
                onChange={(e) =>
                  setPhysicsConfig({ ...physicsConfig, repulsion: Number(e.target.value) })
                }
                className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Link Distance</span>
                <span className="font-mono">{physicsConfig.linkDistance}</span>
              </div>
              <input
                type="range"
                min="20"
                max="200"
                step="5"
                value={physicsConfig.linkDistance}
                onChange={(e) =>
                  setPhysicsConfig({ ...physicsConfig, linkDistance: Number(e.target.value) })
                }
                className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Center Gravity</span>
                <span className="font-mono">{physicsConfig.gravity}</span>
              </div>
              <input
                type="range"
                min="0.02"
                max="0.35"
                step="0.01"
                value={physicsConfig.gravity}
                onChange={(e) =>
                  setPhysicsConfig({ ...physicsConfig, gravity: Number(e.target.value) })
                }
                className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Display Options Section */}
          <div className="space-y-2.5 pt-2 border-t border-white/10">
            <div className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>Display & Aesthetics</span>
            </div>

            <label className="flex items-center justify-between cursor-pointer text-slate-300">
              <span>Curved Links</span>
              <input
                type="checkbox"
                checked={displayConfig.curvedEdges}
                onChange={(e) =>
                  setDisplayConfig({ ...displayConfig, curvedEdges: e.target.checked })
                }
                className="accent-indigo-500 rounded"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer text-slate-300">
              <span>Animated Particles</span>
              <input
                type="checkbox"
                checked={displayConfig.animateParticles}
                onChange={(e) =>
                  setDisplayConfig({ ...displayConfig, animateParticles: e.target.checked })
                }
                className="accent-indigo-500 rounded"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer text-slate-300">
              <span>Halo Glow</span>
              <input
                type="checkbox"
                checked={displayConfig.haloGlow}
                onChange={(e) =>
                  setDisplayConfig({ ...displayConfig, haloGlow: e.target.checked })
                }
                className="accent-indigo-500 rounded"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer text-slate-300">
              <span>Dim Non-Neighbors</span>
              <input
                type="checkbox"
                checked={displayConfig.dimNonNeighbors}
                onChange={(e) =>
                  setDisplayConfig({ ...displayConfig, dimNonNeighbors: e.target.checked })
                }
                className="accent-indigo-500 rounded"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer text-slate-300">
              <span>Show Labels</span>
              <input
                type="checkbox"
                checked={displayConfig.showLabels}
                onChange={(e) =>
                  setDisplayConfig({ ...displayConfig, showLabels: e.target.checked })
                }
                className="accent-indigo-500 rounded"
              />
            </label>
          </div>
        </aside>
      )}

      {/* Relationship Selection Modal for multiple valid relationships */}
      {relationshipPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setRelationshipPicker(null)}
        >
          <div
            className="w-full max-w-md bg-[#0F172A] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Choose Relationship</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select semantic connection from{' '}
                  <span className="text-cyan-300 font-medium">
                    {getProperty(relationshipPicker.sourceNode.properties, 'name') || relationshipPicker.sourceNode.id}
                  </span>{' '}
                  to{' '}
                  <span className="text-cyan-300 font-medium">
                    {getProperty(relationshipPicker.targetNode.properties, 'name') || relationshipPicker.targetNode.id}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setRelationshipPicker(null)}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
              {relationshipPicker.options.map((opt) => {
                const isSelected = relationshipPicker.selectedId === opt.id;
                const group = getRelationshipGroupInfo(opt.id);
                return (
                  <div
                    key={opt.id}
                    onClick={() =>
                      setRelationshipPicker({ ...relationshipPicker, selectedId: opt.id })
                    }
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/50 shadow-lg shadow-cyan-500/10'
                        : 'bg-white/[0.02] border-white/5 hover:border-white/20 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: group.color }}
                        />
                        <span className="text-xs font-semibold text-slate-200">{opt.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-white/5 text-slate-400">
                          {group.group}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                      {opt.description}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                onClick={() => setRelationshipPicker(null)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  callbacksRef.current.addEdge({
                    sourceNodeId: relationshipPicker.sourceNode.id,
                    targetNodeId: relationshipPicker.targetNode.id,
                    relationshipId: relationshipPicker.selectedId
                  });
                  setRelationshipPicker(null);
                  if (workerRef.current) {
                    workerRef.current.postMessage({ type: 'reheat' });
                  }
                }}
                className="px-4 py-2 text-xs font-medium text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
              >
                Create Relationship
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Semantic Rejection Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-rose-950/90 border border-rose-500/40 text-rose-200 text-xs shadow-2xl backdrop-blur-md animate-slide-up">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-rose-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
