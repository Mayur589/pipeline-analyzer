import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { useGraphStore } from '../store/graphStore';
import { getProperty } from '../types/graph';

interface EngineNode extends d3.SimulationNodeDatum {
  id: string;
  categoryId: string;
  name: string;
  color: string;
  properties: Record<string, any>;
  radius: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface EngineLink extends d3.SimulationLinkDatum<EngineNode> {
  id: string;
  source: string | EngineNode;
  target: string | EngineNode;
  relationship: string;
}

// Distance from point (px, py) to line segment (x1, y1) - (x2, y2)
function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

// Word-wrap helper for canvas text inside circular node
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

export const ObsidianGraphEngine: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  // Camera State (Pan & Zoom)
  const cameraRef = useRef<{ x: number; y: number; zoom: number }>({
    x: 0,
    y: 0,
    zoom: 1
  });

  // Active interaction tracking
  const interactionRef = useRef<{
    isPanning: boolean;
    panStartX: number;
    panStartY: number;
    draggedNode: EngineNode | null;
    connectingNode: EngineNode | null;
    connectHandlePos: { x: number; y: number } | null;
    currentMouseWorld: { x: number; y: number };
    hasMovedDuringDrag: boolean;
  }>({
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    draggedNode: null,
    connectingNode: null,
    connectHandlePos: null,
    currentMouseWorld: { x: 0, y: 0 },
    hasMovedDuringDrag: false
  });

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<{ nodeId: string; handle: string } | null>(null);

  // Physics simulation references
  const simulationRef = useRef<d3.Simulation<EngineNode, EngineLink> | null>(null);
  const engineNodesRef = useRef<EngineNode[]>([]);
  const engineLinksRef = useRef<EngineLink[]>([]);
  const animFrameIdRef = useRef<number | null>(null);

  // Synchronize store nodes & edges with d3-force simulation
  useEffect(() => {
    const existingNodeMap = new Map(engineNodesRef.current.map((n) => [n.id, n]));

    const nextNodes: EngineNode[] = nodes.map((n) => {
      const existing = existingNodeMap.get(n.id);
      const cat = nodeCategories.find((c) => c.id === n.categoryId);
      const color = cat?.color || '#06b6d4';
      const name = getProperty(n.properties, 'name') || n.id;

      if (existing) {
        existing.name = name;
        existing.color = color;
        existing.properties = n.properties as Record<string, any>;
        return existing;
      }

      return {
        id: n.id,
        categoryId: n.categoryId,
        name,
        color,
        properties: n.properties as Record<string, any>,
        radius: 34, // 68px diameter
        x: n.position ? n.position.x : (window.innerWidth / 2 - 200) + (Math.random() - 0.5) * 100,
        y: n.position ? n.position.y : (window.innerHeight / 2) + (Math.random() - 0.5) * 100
      };
    });

    const nextLinks: EngineLink[] = edges.map((e) => ({
      id: e.id,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      relationship: e.relationship
    }));

    engineNodesRef.current = nextNodes;
    engineLinksRef.current = nextLinks;

    // Initialize or update simulation
    if (!simulationRef.current) {
      const width = containerRef.current?.clientWidth || window.innerWidth;
      const height = containerRef.current?.clientHeight || window.innerHeight;

      // Center camera initially
      cameraRef.current = {
        x: width / 2,
        y: height / 2,
        zoom: 1
      };

      const sim = d3
        .forceSimulation<EngineNode>(nextNodes)
        // Coulomb's Law (Node Repulsion via Barnes-Hut)
        .force(
          'charge',
          d3.forceManyBody<EngineNode>().strength(-450).distanceMax(700)
        )
        // Hooke's Law (Spring Attraction)
        .force(
          'link',
          d3
            .forceLink<EngineNode, EngineLink>(nextLinks)
            .id((d) => d.id)
            .distance(150)
            .strength(0.4)
        )
        // Centering Gravity
        .force('center', d3.forceCenter(0, 0).strength(0.04))
        // Circle Collision Detection (Non-penetration)
        .force(
          'collide',
          d3.forceCollide<EngineNode>().radius((d) => d.radius + 12).iterations(3)
        )
        // Velocity Verlet damping
        .velocityDecay(0.35)
        // Alpha cooling stabilization
        .alphaDecay(0.02)
        .alphaMin(0.001);

      simulationRef.current = sim;
    } else {
      const sim = simulationRef.current;
      sim.nodes(nextNodes);

      const linkForce = sim.force<d3.ForceLink<EngineNode, EngineLink>>('link');
      if (linkForce) {
        linkForce.links(nextLinks);
      }

      // Reheat slightly to settle new additions smoothly
      sim.alpha(0.3).restart();
    }
  }, [nodes, edges, nodeCategories]);

  // Main 60 FPS Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isRunning = true;

    const render = () => {
      if (!isRunning) return;

      const container = containerRef.current;
      const width = container?.clientWidth || window.innerWidth;
      const height = container?.clientHeight || window.innerHeight;
      const dpr = window.devicePixelRatio || 1;

      // Resize canvas buffer if needed
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Charcoal background
      ctx.fillStyle = '#0B1220';
      ctx.fillRect(0, 0, width, height);

      const { x: camX, y: camY, zoom } = cameraRef.current;

      // Draw Faint Dotted Grid aligned to camera transform
      const gridSpacing = 28 * zoom;
      const startGridX = (camX % gridSpacing + gridSpacing) % gridSpacing;
      const startGridY = (camY % gridSpacing + gridSpacing) % gridSpacing;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      for (let gx = startGridX; gx < width; gx += gridSpacing) {
        for (let gy = startGridY; gy < height; gy += gridSpacing) {
          ctx.fillRect(gx - 0.5, gy - 0.5, 1, 1);
        }
      }

      // Apply camera transformation for graph elements
      ctx.save();
      ctx.translate(camX, camY);
      ctx.scale(zoom, zoom);

      const currentNodes = engineNodesRef.current;
      const currentLinks = engineLinksRef.current;

      // 1. Draw Edges (Hooke's spring curves)
      for (const link of currentLinks) {
        const source = link.source as EngineNode;
        const target = link.target as EngineNode;
        if (!source || !target || source.x == null || source.y == null || target.x == null || target.y == null) {
          continue;
        }

        const isEdgeSelected = link.id === selectedEdgeId;

        // Vector from source to target
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.hypot(dx, dy) || 1;

        // Clip endpoints to circumference of circular nodes
        const startX = source.x + (dx / dist) * source.radius;
        const startY = source.y + (dy / dist) * source.radius;
        const endX = target.x - (dx / dist) * target.radius;
        const endY = target.y - (dy / dist) * target.radius;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = isEdgeSelected ? 'rgba(255, 255, 255, 0.85)' : 'rgba(148, 163, 184, 0.25)';
        ctx.lineWidth = isEdgeSelected ? 2 : 1;
        ctx.stroke();

        // Subtle directional arrow near target
        if (dist > (source.radius + target.radius + 15)) {
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
          ctx.strokeStyle = isEdgeSelected ? 'rgba(255, 255, 255, 0.85)' : 'rgba(148, 163, 184, 0.35)';
          ctx.lineWidth = isEdgeSelected ? 2 : 1;
          ctx.stroke();
        }

        // Relationship label (Zoom-adaptive: smooth fade when zoom >= 1.2)
        if (zoom >= 1.2 && link.relationship) {
          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2;
          const alpha = Math.min(1, (zoom - 1.2) / 0.3);

          ctx.save();
          ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
          const textWidth = ctx.measureText(link.relationship).width;
          const pillPaddingX = 6;
          const pillHeight = 16;
          const pillWidth = textWidth + pillPaddingX * 2;

          ctx.globalAlpha = alpha;
          // Pill background
          ctx.fillStyle = isEdgeSelected ? '#151d2f' : '#0B1220';
          ctx.strokeStyle = isEdgeSelected ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.1)';
          ctx.lineWidth = 1;

          ctx.beginPath();
          ctx.roundRect(midX - pillWidth / 2, midY - pillHeight / 2, pillWidth, pillHeight, 4);
          ctx.fill();
          ctx.stroke();

          // Pill text
          ctx.fillStyle = isEdgeSelected ? '#ffffff' : '#94a3b8';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(link.relationship, midX, midY);
          ctx.restore();
        }
      }

      // 2. Draw Interactive Connection Line (when dragging handle to connect)
      if (
        interactionRef.current.connectingNode &&
        interactionRef.current.connectHandlePos
      ) {
        const startPos = interactionRef.current.connectHandlePos;
        const currentWorld = interactionRef.current.currentMouseWorld;

        ctx.beginPath();
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(currentWorld.x, currentWorld.y);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 3. Draw Nodes (Coulomb particles)
      for (const node of currentNodes) {
        if (node.x == null || node.y == null) continue;

        const isSelected = node.id === selectedNodeId;
        const isHovered = node.id === hoveredNodeId;

        // Clean circular body: category solid fill strictly inside
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();

        // Thin neutral border
        ctx.strokeStyle = isSelected
          ? '#ffffff'
          : isHovered
          ? 'rgba(255, 255, 255, 0.4)'
          : 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();

        // Selection state: subtle white ring outside without glow
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 3.5, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Centered name text
        ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const lines = wrapText(ctx, node.name, (node.radius * 2) - 16, 3);
        const lineHeight = 14;
        const totalHeight = (lines.length - 1) * lineHeight;
        const textStartY = node.y - totalHeight / 2;

        lines.forEach((line, i) => {
          ctx.fillText(line, node.x!, textStartY + i * lineHeight);
        });

        // 4 Connection Ports / Handles on circumference (Top, Right, Bottom, Left)
        const handleRadius = 3.5;
        const handles = [
          { name: 'top', x: node.x, y: node.y - node.radius },
          { name: 'right', x: node.x + node.radius, y: node.y },
          { name: 'bottom', x: node.x, y: node.y + node.radius },
          { name: 'left', x: node.x - node.radius, y: node.y }
        ];

        for (const h of handles) {
          const isHov = hoveredHandle?.nodeId === node.id && hoveredHandle.handle === h.name;
          ctx.beginPath();
          ctx.arc(h.x, h.y, isHov ? handleRadius * 1.3 : handleRadius, 0, Math.PI * 2);
          ctx.fillStyle = isHov ? '#ffffff' : '#cbd5e1';
          ctx.fill();
          ctx.strokeStyle = '#0B1220';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      ctx.restore(); // restore camera transform
      ctx.restore(); // restore dpr

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    animFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      isRunning = false;
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [selectedNodeId, selectedEdgeId, hoveredNodeId, hoveredHandle]);

  // Convert screen coordinates to world coordinates
  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    const { x: camX, y: camY, zoom } = cameraRef.current;
    return {
      x: (screenX - camX) / zoom,
      y: (screenY - camY) / zoom
    };
  }, []);

  // Hit test handles and nodes
  const hitTest = useCallback(
    (worldX: number, worldY: number) => {
      const handleRadius = 6;
      for (const node of engineNodesRef.current) {
        if (node.x == null || node.y == null) continue;

        // Check 4 handles
        const handles = [
          { name: 'top', x: node.x, y: node.y - node.radius },
          { name: 'right', x: node.x + node.radius, y: node.y },
          { name: 'bottom', x: node.x, y: node.y + node.radius },
          { name: 'left', x: node.x - node.radius, y: node.y }
        ];

        for (const h of handles) {
          if (Math.hypot(worldX - h.x, worldY - h.y) <= handleRadius) {
            return { type: 'handle' as const, node, handle: h.name, handlePos: h };
          }
        }

        // Check node circle
        if (Math.hypot(worldX - node.x, worldY - node.y) <= node.radius) {
          return { type: 'node' as const, node };
        }
      }

      // Check edges
      for (const link of engineLinksRef.current) {
        const s = link.source as EngineNode;
        const t = link.target as EngineNode;
        if (s.x != null && s.y != null && t.x != null && t.y != null) {
          const d = distToSegment(worldX, worldY, s.x, s.y, t.x, t.y);
          if (d <= 7) {
            return { type: 'edge' as const, link };
          }
        }
      }

      return null;
    },
    []
  );

  // Mouse Down handler
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const world = screenToWorld(mouseX, mouseY);

      interactionRef.current.hasMovedDuringDrag = false;
      const hit = hitTest(world.x, world.y);

      if (hit?.type === 'handle') {
        // Initiating connection drag from handle
        interactionRef.current.connectingNode = hit.node;
        interactionRef.current.connectHandlePos = hit.handlePos;
        interactionRef.current.currentMouseWorld = world;
        return;
      }

      if (hit?.type === 'node') {
        // Initiating node physics drag
        interactionRef.current.draggedNode = hit.node;
        hit.node.fx = hit.node.x;
        hit.node.fy = hit.node.y;
        simulationRef.current?.alphaTarget(0.3).restart();
        return;
      }

      if (hit?.type === 'edge') {
        selectEdge(hit.link.id);
        return;
      }

      // Canvas background pan
      interactionRef.current.isPanning = true;
      interactionRef.current.panStartX = mouseX - cameraRef.current.x;
      interactionRef.current.panStartY = mouseY - cameraRef.current.y;
    },
    [hitTest, screenToWorld, selectEdge]
  );

  // Mouse Move handler
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const world = screenToWorld(mouseX, mouseY);

      interactionRef.current.currentMouseWorld = world;

      // Update hovered elements for cursor
      const hit = hitTest(world.x, world.y);
      if (hit?.type === 'handle') {
        setHoveredHandle({ nodeId: hit.node.id, handle: hit.handle });
        setHoveredNodeId(hit.node.id);
        canvas.style.cursor = 'crosshair';
      } else if (hit?.type === 'node') {
        setHoveredHandle(null);
        setHoveredNodeId(hit.node.id);
        canvas.style.cursor = 'grab';
      } else if (hit?.type === 'edge') {
        setHoveredHandle(null);
        setHoveredNodeId(null);
        canvas.style.cursor = 'pointer';
      } else {
        setHoveredHandle(null);
        setHoveredNodeId(null);
        canvas.style.cursor = interactionRef.current.isPanning ? 'grabbing' : 'default';
      }

      // 1. Active connection drag
      if (interactionRef.current.connectingNode) {
        interactionRef.current.hasMovedDuringDrag = true;
        return;
      }

      // 2. Active node physics drag
      if (interactionRef.current.draggedNode) {
        interactionRef.current.hasMovedDuringDrag = true;
        const node = interactionRef.current.draggedNode;
        node.fx = world.x;
        node.fy = world.y;
        return;
      }

      // 3. Camera panning
      if (interactionRef.current.isPanning) {
        interactionRef.current.hasMovedDuringDrag = true;
        cameraRef.current.x = mouseX - interactionRef.current.panStartX;
        cameraRef.current.y = mouseY - interactionRef.current.panStartY;
      }
    },
    [hitTest, screenToWorld]
  );

  // Mouse Up handler
  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const world = screenToWorld(mouseX, mouseY);

      // 1. Finish connection creation
      if (interactionRef.current.connectingNode) {
        const sourceNode = interactionRef.current.connectingNode;
        const hit = hitTest(world.x, world.y);

        if (hit?.type === 'node' && hit.node.id !== sourceNode.id) {
          addEdge({
            sourceNodeId: sourceNode.id,
            targetNodeId: hit.node.id,
            relationship: 'relates to'
          });
        }

        interactionRef.current.connectingNode = null;
        interactionRef.current.connectHandlePos = null;
        return;
      }

      // 2. Finish node physics drag
      if (interactionRef.current.draggedNode) {
        const node = interactionRef.current.draggedNode;
        const hasMoved = interactionRef.current.hasMovedDuringDrag;

        node.fx = null;
        node.fy = null;
        simulationRef.current?.alphaTarget(0);

        if (hasMoved) {
          updateNodePosition(node.id, { x: node.x!, y: node.y! });
        } else {
          // Pure click without drag selects the node
          selectNode(node.id);
        }

        interactionRef.current.draggedNode = null;
        return;
      }

      // 3. Finish camera pan
      if (interactionRef.current.isPanning) {
        if (!interactionRef.current.hasMovedDuringDrag) {
          // Clicked empty canvas
          clearSelection();
        }
        interactionRef.current.isPanning = false;
      }
    },
    [hitTest, screenToWorld, addEdge, selectNode, clearSelection, updateNodePosition]
  );

  // Camera Wheel Zoom towards mouse cursor
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const currentCamera = cameraRef.current;
    const nextZoom = Math.max(0.15, Math.min(3.5, currentCamera.zoom * zoomFactor));

    // Keep world coordinate under mouse stationary
    const worldX = (mouseX - currentCamera.x) / currentCamera.zoom;
    const worldY = (mouseY - currentCamera.y) / currentCamera.zoom;

    cameraRef.current = {
      zoom: nextZoom,
      x: mouseX - worldX * nextZoom,
      y: mouseY - worldY * nextZoom
    };
  }, []);

  // Drop category from sidebar onto canvas -> Injects node into physics world
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
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const world = screenToWorld(mouseX, mouseY);

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

      // Add to store and trigger physics impulse
      await addNode({
        categoryId,
        properties: defaultProperties,
        position: { x: world.x, y: world.y }
      });

      // Gently reheat simulation
      simulationRef.current?.alpha(0.4).restart();
    },
    [screenToWorld, nodeCategories, addNode]
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-[#0B1220] select-none"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className="absolute inset-0 block w-full h-full"
      />

      {/* Clean Empty State */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6 select-none">
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
