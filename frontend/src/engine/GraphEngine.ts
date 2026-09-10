import type { GraphNode, GraphEdge, DisplayConfig, FilterConfig } from '../types/graph';
import { drawNode } from './customRenderers';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export class GraphEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationFrameId: number | null = null;
  private worker: Worker | null = null;

  private nodes: GraphNode[] = [];
  private edges: GraphEdge[] = [];
  private nodesMap = new Map<string, GraphNode>();
  private adjacencyMap = new Map<string, Set<string>>();

  private displayConfig!: DisplayConfig;
  private filterConfig!: FilterConfig;
  private searchResults = new Set<string>();

  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private selectedNodeId: string | null = null;
  private selectedEdgeId: string | null = null;
  private hoveredNodeId: string | null = null;
  private connectingSourceId: string | null = null;
  private mouseWorldPos = { x: 0, y: 0 };
  private isDraggingNode = false;
  private isPanning = false;
  private dragNodeId: string | null = null;
  private panStart = { x: 0, y: 0 };

  private particleOffset = 0;

  // Callbacks
  private onSelectNode?: (id: string | null, e?: PointerEvent) => void;
  private onSelectEdge?: (id: string | null) => void;
  private onHoverNode?: (id: string | null) => void;
  private onConnectNodes?: (sourceId: string, targetId: string) => void;
  private onConnectCancel?: () => void;
  private onNodeContextMenu?: (id: string | null, clientX: number, clientY: number) => void;

  constructor(
    canvas: HTMLCanvasElement,
    options: {
      onSelectNode?: (id: string | null, e?: PointerEvent) => void;
      onSelectEdge?: (id: string | null) => void;
      onHoverNode?: (id: string | null) => void;
      onConnectNodes?: (sourceId: string, targetId: string) => void;
      onConnectCancel?: () => void;
      onNodeContextMenu?: (id: string | null, clientX: number, clientY: number) => void;
    }
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.onSelectNode = options.onSelectNode;
    this.onSelectEdge = options.onSelectEdge;
    this.onHoverNode = options.onHoverNode;
    this.onConnectNodes = options.onConnectNodes;
    this.onConnectCancel = options.onConnectCancel;
    this.onNodeContextMenu = options.onNodeContextMenu;

    this.setupEvents();
    this.centerCamera();
  }

  public setConnectingSource(nodeId: string | null) {
    this.connectingSourceId = nodeId;
    if (this.canvas) {
      this.canvas.style.cursor = nodeId ? 'crosshair' : 'grab';
    }
  }

  public initWorker(worker: Worker) {
    this.worker = worker;
    this.worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'tick' && e.data.positions) {
        const positions: Array<{ id: string; x: number; y: number; vx: number; vy: number }> = e.data.positions;
        positions.forEach(pos => {
          const node = this.nodesMap.get(pos.id);
          if (node) {
            node.x = pos.x;
            node.y = pos.y;
            node.vx = pos.vx;
            node.vy = pos.vy;
          }
        });
      }
    };
  }

  public updateData(nodes: GraphNode[], edges: GraphEdge[]) {
    // Preserve existing simulated coordinates across data updates
    nodes.forEach(n => {
      const existing = this.nodesMap.get(n.id);
      if (existing) {
        if (n.x === undefined && existing.x !== undefined) n.x = existing.x;
        if (n.y === undefined && existing.y !== undefined) n.y = existing.y;
        if (n.vx === undefined && existing.vx !== undefined) n.vx = existing.vx;
        if (n.vy === undefined && existing.vy !== undefined) n.vy = existing.vy;
        if (n.fx === undefined && existing.fx !== undefined) n.fx = existing.fx;
        if (n.fy === undefined && existing.fy !== undefined) n.fy = existing.fy;
      }
    });

    this.nodes = nodes;
    this.edges = edges;
    this.nodesMap.clear();
    this.adjacencyMap.clear();

    nodes.forEach(n => {
      this.nodesMap.set(n.id, n);
      this.adjacencyMap.set(n.id, new Set());
    });

    edges.forEach(e => {
      const src = typeof e.source === 'object' ? (e.source as any).id : e.source;
      const tgt = typeof e.target === 'object' ? (e.target as any).id : e.target;
      if (this.adjacencyMap.has(src)) this.adjacencyMap.get(src)!.add(tgt);
      if (this.adjacencyMap.has(tgt)) this.adjacencyMap.get(tgt)!.add(src);
    });
  }

  public updateConfigs(
    displayConfig: DisplayConfig,
    filterConfig: FilterConfig,
    searchResults: Set<string>,
    selectedNodeId: string | null,
    hoveredNodeId: string | null,
    selectedEdgeId?: string | null
  ) {
    this.displayConfig = displayConfig;
    this.filterConfig = filterConfig;
    this.searchResults = searchResults;
    this.selectedNodeId = selectedNodeId;
    this.hoveredNodeId = hoveredNodeId;
    if (selectedEdgeId !== undefined) {
      this.selectedEdgeId = selectedEdgeId;
    }
  }

  public resize(width: number, height: number) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(dpr, dpr);
  }

  public startRenderLoop() {
    if (this.animationFrameId !== null) return;

    const render = () => {
      this.draw();
      this.particleOffset = (this.particleOffset + 0.008) % 1;
      this.animationFrameId = requestAnimationFrame(render);
    };
    render();
  }

  public stopRenderLoop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public centerCamera() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.camera = { x: width / 2, y: height / 2, zoom: 1.0 };
  }

  public zoomIn(factor = 1.3) {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    const newZoom = Math.min(5.0, this.camera.zoom * factor);
    this.camera.x = width / 2 - (width / 2 - this.camera.x) * (newZoom / this.camera.zoom);
    this.camera.y = height / 2 - (height / 2 - this.camera.y) * (newZoom / this.camera.zoom);
    this.camera.zoom = newZoom;
  }

  public zoomOut(factor = 1.3) {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    const newZoom = Math.max(0.1, this.camera.zoom / factor);
    this.camera.x = width / 2 - (width / 2 - this.camera.x) * (newZoom / this.camera.zoom);
    this.camera.y = height / 2 - (height / 2 - this.camera.y) * (newZoom / this.camera.zoom);
    this.camera.zoom = newZoom;
  }

  public centerOnNode(nodeId: string) {
    const node = this.nodesMap.get(nodeId);
    if (!node || node.x === undefined || node.y === undefined) return;
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.camera.x = width / 2 - node.x * this.camera.zoom;
    this.camera.y = height / 2 - node.y * this.camera.zoom;
  }

  private setupEvents() {
    const el = this.canvas;

    el.addEventListener('pointerdown', this.onPointerDown.bind(this));
    el.addEventListener('pointermove', this.onPointerMove.bind(this));
    el.addEventListener('pointerup', this.onPointerUp.bind(this));
    el.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    el.addEventListener('dblclick', this.onDoubleClick.bind(this));
    el.addEventListener('contextmenu', this.onContextMenu.bind(this));

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.connectingSourceId) {
        this.connectingSourceId = null;
        if (this.canvas) this.canvas.style.cursor = 'grab';
        if (this.onConnectCancel) this.onConnectCancel();
      }
    });
  }

  private onContextMenu(e: MouseEvent) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = this.screenToWorld(screenX, screenY);

    const hitNode = this.hitTest(worldPos.x, worldPos.y);
    if (this.onNodeContextMenu) {
      this.onNodeContextMenu(hitNode ? hitNode.id : null, e.clientX, e.clientY);
    }
  }

  public screenToWorld(screenX: number, screenY: number) {
    return {
      x: (screenX - this.camera.x) / this.camera.zoom,
      y: (screenY - this.camera.y) / this.camera.zoom
    };
  }

  private onDoubleClick(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = this.screenToWorld(screenX, screenY);

    const hitNode = this.hitTest(worldPos.x, worldPos.y);
    if (hitNode) {
      this.centerOnNode(hitNode.id);
    } else {
      this.centerCamera();
    }
  }

  private hitTestEdge(worldX: number, worldY: number): GraphEdge | null {
    for (let i = this.edges.length - 1; i >= 0; i--) {
      const edge = this.edges[i];
      const srcId = typeof edge.source === 'object' ? (edge.source as any).id : edge.source;
      const tgtId = typeof edge.target === 'object' ? (edge.target as any).id : edge.target;
      const srcNode = this.nodesMap.get(srcId);
      const tgtNode = this.nodesMap.get(tgtId);
      if (!srcNode || !tgtNode) continue;

      const x1 = srcNode.x ?? 0;
      const y1 = srcNode.y ?? 0;
      const x2 = tgtNode.x ?? 0;
      const y2 = tgtNode.y ?? 0;

      const dx = x2 - x1;
      const dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;

      let t = ((worldX - x1) * dx + (worldY - y1) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const projX = x1 + t * dx;
      const projY = y1 + t * dy;
      const distSq = (worldX - projX) * (worldX - projX) + (worldY - projY) * (worldY - projY);

      if (distSq < 64) {
        return edge;
      }
    }
    return null;
  }

  private onPointerDown(e: PointerEvent) {
    // Prevent right-click from triggering node dragging or panning
    if (e.button === 2) {
      if (this.connectingSourceId) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldPos = this.screenToWorld(screenX, screenY);
        const hitNode = this.hitTest(worldPos.x, worldPos.y);
        if (hitNode && hitNode.id !== this.connectingSourceId) {
          if (this.onConnectNodes) {
            this.onConnectNodes(this.connectingSourceId, hitNode.id);
          }
          this.connectingSourceId = null;
        }
      }
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = this.screenToWorld(screenX, screenY);

    const hitNode = this.hitTest(worldPos.x, worldPos.y);

    // Active connection flow (either initiated via connect button or HUD)
    if (this.connectingSourceId) {
      if (hitNode && hitNode.id !== this.connectingSourceId) {
        if (this.onConnectNodes) {
          this.onConnectNodes(this.connectingSourceId, hitNode.id);
        }
        this.connectingSourceId = null;
        this.isDraggingNode = false;
        this.dragNodeId = null;
        this.canvas.style.cursor = 'pointer';
        return;
      } else {
        // Cancel if clicked empty canvas or same node
        this.connectingSourceId = null;
        this.isDraggingNode = false;
        this.dragNodeId = null;
        this.canvas.style.cursor = 'grab';
        if (this.onConnectCancel) this.onConnectCancel();
        return;
      }
    }

    // Quick Shift + Click connection shortcut from selected node
    if (e.shiftKey && this.selectedNodeId && hitNode && hitNode.id !== this.selectedNodeId) {
      if (this.onConnectNodes) {
        this.onConnectNodes(this.selectedNodeId, hitNode.id);
      }
      this.isDraggingNode = false;
      this.dragNodeId = null;
      return;
    }

    if (hitNode) {
      this.isDraggingNode = true;
      this.dragNodeId = hitNode.id;
      if (this.onSelectNode) this.onSelectNode(hitNode.id, e);

      if (this.worker) {
        this.worker.postMessage({
          type: 'dragNode',
          nodeId: hitNode.id,
          x: worldPos.x,
          y: worldPos.y
        });
      }
    } else {
      const hitEdge = this.hitTestEdge(worldPos.x, worldPos.y);
      if (hitEdge) {
        if (this.onSelectEdge) this.onSelectEdge(hitEdge.id);
      } else {
        this.isPanning = true;
        this.panStart = { x: screenX - this.camera.x, y: screenY - this.camera.y };
        if (this.onSelectNode) this.onSelectNode(null, e);
        if (this.onSelectEdge) this.onSelectEdge(null);
      }
    }
  }

  private onPointerMove(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = this.screenToWorld(screenX, screenY);
    this.mouseWorldPos = worldPos;

    if (this.connectingSourceId) {
      const hitNode = this.hitTest(worldPos.x, worldPos.y);
      this.canvas.style.cursor = hitNode && hitNode.id !== this.connectingSourceId ? 'crosshair' : 'crosshair';
      return;
    }

    if (this.isDraggingNode && this.dragNodeId) {
      const node = this.nodesMap.get(this.dragNodeId);
      if (node) {
        node.fx = worldPos.x;
        node.fy = worldPos.y;
        node.x = worldPos.x;
        node.y = worldPos.y;
      }
      if (this.worker) {
        this.worker.postMessage({
          type: 'dragNode',
          nodeId: this.dragNodeId,
          x: worldPos.x,
          y: worldPos.y
        });
      }
    } else if (this.isPanning) {
      this.camera.x = screenX - this.panStart.x;
      this.camera.y = screenY - this.panStart.y;
    } else {
      // Hover detection
      const hitNode = this.hitTest(worldPos.x, worldPos.y);
      this.canvas.style.cursor = hitNode ? 'pointer' : 'grab';
      if (this.onHoverNode) {
        this.onHoverNode(hitNode ? hitNode.id : null);
      }
    }
  }

  private onPointerUp() {
    if (this.isDraggingNode && this.dragNodeId) {
      if (this.worker) {
        this.worker.postMessage({ type: 'dragEnd', nodeId: this.dragNodeId });
      }
      const node = this.nodesMap.get(this.dragNodeId);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
    }
    this.isDraggingNode = false;
    this.dragNodeId = null;
    this.isPanning = false;
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    // Smooth, slow, natural zoom dampening (exponential curve)
    const zoomSensitivity = 0.0012;
    const zoomFactor = Math.exp(-e.deltaY * zoomSensitivity);
    const newZoom = Math.max(0.15, Math.min(4.0, this.camera.zoom * zoomFactor));

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    this.camera.x = mouseX - (mouseX - this.camera.x) * (newZoom / this.camera.zoom);
    this.camera.y = mouseY - (mouseY - this.camera.y) * (newZoom / this.camera.zoom);
    this.camera.zoom = newZoom;
  }

  private hitTest(worldX: number, worldY: number): GraphNode | null {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const radius = ((node.size || 20) * this.displayConfig.nodeScale) + 6;

      const dx = worldX - nx;
      const dy = worldY - ny;
      if (dx * dx + dy * dy <= radius * radius) {
        return node;
      }
    }
    return null;
  }

  private draw() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    // Dark canvas background
    this.ctx.fillStyle = '#090d16';
    this.ctx.fillRect(0, 0, width, height);

    this.ctx.save();
    // Camera Transform Matrix
    this.ctx.translate(this.camera.x, this.camera.y);
    this.ctx.scale(this.camera.zoom, this.camera.zoom);

    // Subtle background grid lines
    this.drawBackgroundGrid(width, height);

    // Active Neighborhood calculation
    const activeFocusId = this.hoveredNodeId || this.selectedNodeId;
    const activeNeighbors = new Set<string>();
    if (activeFocusId) {
      activeNeighbors.add(activeFocusId);
      const connected = this.adjacencyMap.get(activeFocusId);
      if (connected) {
        connected.forEach(id => activeNeighbors.add(id));
      }
    }

    const hasSearch = this.filterConfig?.searchQuery?.trim()?.length > 0;

    // Draw Edges
    this.edges.forEach(edge => {
      const srcId = typeof edge.source === 'object' ? (edge.source as any).id : edge.source;
      const tgtId = typeof edge.target === 'object' ? (edge.target as any).id : edge.target;

      const srcNode = this.nodesMap.get(srcId);
      const tgtNode = this.nodesMap.get(tgtId);

      if (!srcNode || !tgtNode) return;

      const isConnectedToFocus = activeFocusId
        ? srcId === activeFocusId || tgtId === activeFocusId
        : true;

      const isDimmed =
        (this.displayConfig.dimNonNeighbors && activeFocusId && !isConnectedToFocus) ||
        (hasSearch && (!this.searchResults.has(srcId) || !this.searchResults.has(tgtId)));

      this.drawEdge(srcNode, tgtNode, edge, isDimmed, isConnectedToFocus && Boolean(activeFocusId));
    });

    // Draw Nodes
    this.nodes.forEach(node => {
      const isSelected = node.id === this.selectedNodeId;
      const isHovered = node.id === this.hoveredNodeId;
      const isNeighbor = activeNeighbors.has(node.id);

      const isDimmed =
        (this.displayConfig.dimNonNeighbors && activeFocusId && !isNeighbor) ||
        (hasSearch && !this.searchResults.has(node.id));

      drawNode(
        this.ctx,
        node,
        isSelected,
        isHovered,
        isDimmed,
        this.displayConfig,
        () => this.draw()
      );
    });

    // Dynamic Connection Rubberband Preview
    if (this.connectingSourceId) {
      const srcNode = this.nodesMap.get(this.connectingSourceId);
      if (srcNode) {
        const sx = srcNode.x ?? 0;
        const sy = srcNode.y ?? 0;
        const hitTarget = this.hitTest(this.mouseWorldPos.x, this.mouseWorldPos.y);
        const tx =
          hitTarget && hitTarget.id !== this.connectingSourceId
            ? (hitTarget.x ?? this.mouseWorldPos.x)
            : this.mouseWorldPos.x;
        const ty =
          hitTarget && hitTarget.id !== this.connectingSourceId
            ? (hitTarget.y ?? this.mouseWorldPos.y)
            : this.mouseWorldPos.y;

        this.ctx.save();
        // Guideline dashed line
        this.ctx.strokeStyle = '#06b6d4';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([6, 4]);
        this.ctx.beginPath();
        this.ctx.moveTo(sx, sy);
        this.ctx.lineTo(tx, ty);
        this.ctx.stroke();

        // Pulsing rings around source node
        const pulse = Math.sin(Date.now() / 150) * 3 + 6;
        const srcRadius = ((srcNode.size || 20) * this.displayConfig.nodeScale) + pulse;
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, srcRadius, 0, Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(6, 182, 212, 0.7)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([]);
        this.ctx.stroke();

        // Target hover highlight ring
        if (hitTarget && hitTarget.id !== this.connectingSourceId) {
          const tgtRadius = ((hitTarget.size || 20) * this.displayConfig.nodeScale) + 8;
          this.ctx.beginPath();
          this.ctx.arc(hitTarget.x ?? 0, hitTarget.y ?? 0, tgtRadius, 0, Math.PI * 2);
          this.ctx.strokeStyle = '#22d3ee';
          this.ctx.lineWidth = 2.5;
          this.ctx.stroke();
        }

        this.ctx.restore();
      }
    }

    this.ctx.restore();
  }

  private drawBackgroundGrid(canvasWidth: number, canvasHeight: number) {
    const gridSize = 40;
    const startX = -this.camera.x / this.camera.zoom - 500;
    const startY = -this.camera.y / this.camera.zoom - 500;
    const endX = (canvasWidth - this.camera.x) / this.camera.zoom + 500;
    const endY = (canvasHeight - this.camera.y) / this.camera.zoom + 500;

    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (let x = Math.floor(startX / gridSize) * gridSize; x < endX; x += gridSize) {
      for (let y = Math.floor(startY / gridSize) * gridSize; y < endY; y += gridSize) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  private drawEdge(
    src: GraphNode,
    tgt: GraphNode,
    edge: GraphEdge,
    isDimmed: boolean,
    isHighlighted: boolean
  ) {
    const x1 = src.x ?? 0;
    const y1 = src.y ?? 0;
    const x2 = tgt.x ?? 0;
    const y2 = tgt.y ?? 0;

    const isSelected = Boolean(this.selectedEdgeId && edge.id === this.selectedEdgeId);

    this.ctx.save();
    this.ctx.globalAlpha = isDimmed ? 0.08 : (isSelected ? 1.0 : (isHighlighted ? 0.9 : 0.35));

    this.ctx.strokeStyle = isSelected
      ? '#38bdf8'
      : (isHighlighted ? '#818cf8' : (edge.color || '#475569'));
    this.ctx.lineWidth = isSelected
      ? 2.8
      : (isHighlighted ? this.displayConfig.linkThickness * 2 : this.displayConfig.linkThickness);

    if (edge.type === 'dashed') {
      this.ctx.setLineDash([6, 6]);
    } else {
      this.ctx.setLineDash([]);
    }

    let midX = (x1 + x2) / 2;
    let midY = (y1 + y2) / 2;

    if (this.displayConfig.curvedEdges) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const curvature = 0.15;
      midX = (x1 + x2) / 2 - dy * curvature;
      midY = (y1 + y2) / 2 + dx * curvature;

      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.quadraticCurveTo(midX, midY, x2, y2);
      this.ctx.stroke();
    } else {
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    }

    // Directional Arrowheads
    if (this.displayConfig.showArrows && edge.type === 'directional') {
      const tgtRadius = (tgt.size || 20) * this.displayConfig.nodeScale;
      const angle = Math.atan2(y2 - midY, x2 - midX);
      const arrowX = x2 - Math.cos(angle) * (tgtRadius + 6);
      const arrowY = y2 - Math.sin(angle) * (tgtRadius + 6);

      const arrowLength = 8;
      this.ctx.fillStyle = isSelected ? '#38bdf8' : (isHighlighted ? '#818cf8' : '#64748b');
      this.ctx.beginPath();
      this.ctx.moveTo(arrowX, arrowY);
      this.ctx.lineTo(
        arrowX - arrowLength * Math.cos(angle - Math.PI / 6),
        arrowY - arrowLength * Math.sin(angle - Math.PI / 6)
      );
      this.ctx.lineTo(
        arrowX - arrowLength * Math.cos(angle + Math.PI / 6),
        arrowY - arrowLength * Math.sin(angle + Math.PI / 6)
      );
      this.ctx.closePath();
      this.ctx.fill();
    }

    // Edge Label Pill (if selected or hovered)
    if (isSelected && edge.label) {
      this.ctx.save();
      this.ctx.font = '10px sans-serif';
      const textWidth = this.ctx.measureText(edge.label).width;
      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      this.ctx.beginPath();
      this.ctx.roundRect(midX - textWidth / 2 - 6, midY - 9, textWidth + 12, 18, 4);
      this.ctx.fill();
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
      this.ctx.fillStyle = '#f8fafc';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(edge.label, midX, midY);
      this.ctx.restore();
    }

    // Animated Particles
    if (this.displayConfig.animateParticles && !isDimmed) {
      const t = this.particleOffset;
      let px: number, py: number;

      if (this.displayConfig.curvedEdges) {
        px = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * midX + t * t * x2;
        py = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * midY + t * t * y2;
      } else {
        px = x1 + (x2 - x1) * t;
        py = y1 + (y2 - y1) * t;
      }

      this.ctx.beginPath();
      this.ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      this.ctx.fillStyle = isSelected
        ? '#38bdf8'
        : (isHighlighted ? '#a5b4fc' : 'rgba(148, 163, 184, 0.7)');
      this.ctx.fill();
    }

    this.ctx.restore();
  }
}
