import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import * as d3 from 'd3';
import { useGraphStore } from '../store/graphStore';
import { getProperty } from '../types/graph';

// Word wrap helper for canvas labels
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number = 3
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = ctx.measureText(testLine).width;
    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length === maxLines - 1) break;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.slice(0, maxLines);
}

export const ForceGraphEngine: React.FC = () => {
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const {
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    selectNode,
    selectEdge,
    clearSelection,
    addNode,
    addEdge,
    updateNodePosition,
    nodeCategories
  } = useGraphStore();

  // Connection mode state (Shift + click or handle drag)
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);

  // ResizeObserver for dynamic container dimensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width || window.innerWidth,
          height: entry.contentRect.height || window.innerHeight
        });
      }
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Format nodes and links for react-force-graph
  const graphData = useMemo(() => {
    const formattedNodes = nodes.map((n) => {
      const cat = nodeCategories.find((c) => c.id === n.categoryId);
      const color = cat?.color || '#06b6d4';
      const name = getProperty(n.properties, 'name') || n.id;

      return {
        id: n.id,
        categoryId: n.categoryId,
        name,
        color,
        properties: n.properties,
        radius: 34, // 68px diameter
        x: n.position?.x,
        y: n.position?.y
      };
    });

    const formattedLinks = edges.map((e) => ({
      id: e.id,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      relationship: e.relationship
    }));

    return {
      nodes: formattedNodes,
      links: formattedLinks
    };
  }, [nodes, edges, nodeCategories]);

  // Configure custom physics forces on the d3-force simulation
  useEffect(() => {
    if (fgRef.current) {
      // Coulomb's Law (Node Repulsion via Barnes-Hut)
      fgRef.current.d3Force('charge')?.strength(-450).distanceMax(700);

      // Hooke's Law (Spring Attraction)
      fgRef.current.d3Force('link')?.distance(150).strength(0.4);

      // Center Gravity
      fgRef.current.d3Force('center')?.strength(0.04);

      // Circle Collision Detection (Non-overlap)
      fgRef.current.d3Force(
        'collide',
        d3.forceCollide((d: any) => (d.radius || 34) + 12).iterations(3)
      );
    }
  }, []);

  // Custom node painting callback
  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D) => {
      const isSelected = node.id === selectedNodeId;
      const isConnectSource = node.id === connectSourceId;

      // 1. Solid circular node body
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = node.color || '#06b6d4';
      ctx.fill();

      // 2. Thin neutral border
      ctx.strokeStyle = isSelected
        ? '#ffffff'
        : isConnectSource
        ? '#38bdf8'
        : 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = isSelected || isConnectSource ? 2 : 1;
      ctx.stroke();

      // 3. Subtle outer ring on selection
      if (isSelected || isConnectSource) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = isConnectSource ? 'rgba(56, 189, 248, 0.8)' : 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // 4. Centered node name
      ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const lines = wrapText(ctx, node.name || node.id, node.radius * 2 - 16, 3);
      const lineHeight = 14;
      const totalHeight = (lines.length - 1) * lineHeight;
      const textStartY = node.y - totalHeight / 2;

      lines.forEach((line, i) => {
        ctx.fillText(line, node.x, textStartY + i * lineHeight);
      });

      // 5. Four circumference connection ports
      const handleRadius = 3.5;
      const handles = [
        { x: node.x, y: node.y - node.radius },
        { x: node.x + node.radius, y: node.y },
        { x: node.x, y: node.y + node.radius },
        { x: node.x - node.radius, y: node.y }
      ];

      for (const h of handles) {
        ctx.beginPath();
        ctx.arc(h.x, h.y, handleRadius, 0, Math.PI * 2);
        ctx.fillStyle = isConnectSource ? '#38bdf8' : '#cbd5e1';
        ctx.fill();
        ctx.strokeStyle = '#0B1220';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    },
    [selectedNodeId, connectSourceId]
  );

  // Custom node hit-area pointer paint
  const paintNodePointerArea = useCallback((node: any, color: string, ctx: CanvasRenderingContext2D) => {
    ctx.beginPath();
    ctx.arc(node.x, node.y, (node.radius || 34) + 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  // Custom link painting callback
  const paintLink = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const source = link.source;
      const target = link.target;
      if (!source || !target || source.x == null || source.y == null || target.x == null || target.y == null) {
        return;
      }

      const isSelected = link.id === selectedEdgeId;

      // Vector from source to target
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.hypot(dx, dy) || 1;

      const sourceRadius = source.radius || 34;
      const targetRadius = target.radius || 34;

      const startX = source.x + (dx / dist) * sourceRadius;
      const startY = source.y + (dy / dist) * sourceRadius;
      const endX = target.x - (dx / dist) * targetRadius;
      const endY = target.y - (dy / dist) * targetRadius;

      // 1. Draw edge line
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = isSelected ? 'rgba(255, 255, 255, 0.85)' : 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      // 2. Directional arrowhead
      if (dist > sourceRadius + targetRadius + 15) {
        const arrowLen = 6;
        const arrowAngle = Math.PI / 7;
        const lineAngle = Math.atan2(dy, dx);

        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - arrowLen * Math.cos(lineAngle - arrowAngle),
          endY - arrowLen * Math.sin(lineAngle - arrowAngle)
        );
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - arrowLen * Math.cos(lineAngle + arrowAngle),
          endY - arrowLen * Math.sin(lineAngle + arrowAngle)
        );
        ctx.strokeStyle = isSelected ? 'rgba(255, 255, 255, 0.85)' : 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();
      }

      // 3. Zoom-based relationship label badge (smooth fade when globalScale >= 1.2)
      if (globalScale >= 1.2 && link.relationship) {
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        const alpha = Math.min(1, (globalScale - 1.2) / 0.3);

        ctx.save();
        ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        const textWidth = ctx.measureText(link.relationship).width;
        const pillPaddingX = 6;
        const pillHeight = 16;
        const pillWidth = textWidth + pillPaddingX * 2;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = isSelected ? '#151d2f' : '#0B1220';
        ctx.strokeStyle = isSelected ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.roundRect(midX - pillWidth / 2, midY - pillHeight / 2, pillWidth, pillHeight, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isSelected ? '#ffffff' : '#94a3b8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(link.relationship, midX, midY);
        ctx.restore();
      }
    },
    [selectedEdgeId]
  );

  // Background frame pre-render (draws faint dotted grid in world space)
  const handleRenderFramePre = useCallback((ctx: CanvasRenderingContext2D, globalScale: number) => {
    // Canvas background
    ctx.fillStyle = '#0B1220';
    ctx.fillRect(-10000, -10000, 20000, 20000);

    // Dotted grid
    const gridSpacing = 28;
    const dotSize = 1 / globalScale;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';

    const minX = -4000;
    const maxX = 4000;
    const minY = -4000;
    const maxY = 4000;

    for (let x = minX; x <= maxX; x += gridSpacing) {
      for (let y = minY; y <= maxY; y += gridSpacing) {
        ctx.fillRect(x, y, dotSize, dotSize);
      }
    }
  }, []);

  // Node Drag End
  const handleNodeDragEnd = useCallback(
    (node: any) => {
      if (node.id && node.x != null && node.y != null) {
        updateNodePosition(node.id, { x: node.x, y: node.y });
      }
    },
    [updateNodePosition]
  );

  // Node Click handler (supports Shift+click or connection mode)
  const handleNodeClick = useCallback(
    (node: any, event: MouseEvent) => {
      if (event.shiftKey) {
        if (!connectSourceId) {
          setConnectSourceId(node.id);
        } else if (connectSourceId !== node.id) {
          addEdge({
            sourceNodeId: connectSourceId,
            targetNodeId: node.id,
            relationship: 'relates to'
          });
          setConnectSourceId(null);
        } else {
          setConnectSourceId(null);
        }
        return;
      }

      if (connectSourceId && connectSourceId !== node.id) {
        addEdge({
          sourceNodeId: connectSourceId,
          targetNodeId: node.id,
          relationship: 'relates to'
        });
        setConnectSourceId(null);
        return;
      }

      setConnectSourceId(null);
      selectNode(node.id);
    },
    [connectSourceId, addEdge, selectNode]
  );

  // Link Click handler
  const handleLinkClick = useCallback(
    (link: any) => {
      setConnectSourceId(null);
      selectEdge(link.id);
    },
    [selectEdge]
  );

  // Background Click handler
  const handleBackgroundClick = useCallback(() => {
    setConnectSourceId(null);
    clearSelection();
  }, [clearSelection]);

  // Drop from Sidebar: Unproject screen coordinates to graph coordinates
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
      if (!container || !fgRef.current) return;

      const rect = container.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      // Unproject screen coordinates into graph world coordinates
      const graphCoords = fgRef.current.screen2GraphCoords(clientX, clientY);

      const category = nodeCategories.find((c) => c.id === categoryId);

      const defaultProperties: Record<string, any> = {};
      if (category) {
        category.defaultProperties.forEach((propKey) => {
          const fieldDef = category.fieldDefs?.find((f) => f.key === propKey);
          if (fieldDef?.defaultValue !== undefined) {
            defaultProperties[propKey] = fieldDef.defaultValue;
          } else if (propKey === 'name') {
            defaultProperties[propKey] = category.category;
          } else if (
            propKey.toLowerCase().includes('protection') ||
            propKey.toLowerCase().includes('enabled') ||
            propKey.toLowerCase().includes('required') ||
            propKey.toLowerCase().includes('scanning') ||
            propKey.toLowerCase().includes('ephemeral') ||
            propKey.toLowerCase().includes('zerotrust') ||
            propKey.toLowerCase().includes('immutable')
          ) {
            defaultProperties[propKey] = true;
          } else {
            defaultProperties[propKey] = '';
          }
        });
      }

      await addNode({
        categoryId,
        properties: defaultProperties,
        position: { x: graphCoords.x, y: graphCoords.y }
      });

      fgRef.current.d3ReheatSimulation();
    },
    [nodeCategories, addNode]
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-[#0B1220] select-none"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ForceGraph2D
        ref={fgRef as any}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        backgroundColor="#0B1220"
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={paintNodePointerArea}
        linkCanvasObject={paintLink}
        linkCanvasObjectMode={() => 'replace'}
        onRenderFramePre={handleRenderFramePre}
        onNodeClick={handleNodeClick}
        onLinkClick={handleLinkClick}
        onBackgroundClick={handleBackgroundClick}
        onNodeDragEnd={handleNodeDragEnd}
        d3VelocityDecay={0.35}
        d3AlphaDecay={0.02}
        d3AlphaMin={0.001}
        minZoom={0.15}
        maxZoom={4}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
      />

      {/* Connection Mode Banner */}
      {connectSourceId && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-lg bg-sky-950/80 border border-sky-500/40 text-sky-300 text-xs shadow-lg backdrop-blur-md flex items-center gap-2">
          <span>Click any target node to create a connection (or click background to cancel)</span>
          <button
            onClick={() => setConnectSourceId(null)}
            className="text-sky-400 hover:text-white font-bold ml-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Clean Empty State */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6 select-none z-10">
          <div className="text-center space-y-2 max-w-sm">
            <h2 className="text-base font-medium text-slate-200 tracking-tight">
              Build your software supply chain
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed font-normal">
              Drag a category from the left sidebar to create your first node.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
