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
  private hoveredEdgeId: string | null = null;
  private connectingSourceId: string | null = null;
  private mouseWorldPos = { x: 0, y: 0 };
  private isDraggingNode = false;
  private isPanning = false;
  private dragNodeId: string | null = null;
  private panStart = { x: 0, y: 0 };

  private particleOffset = 0;
  private justConnected = false;
  private rightClickSourceId: string | null = null;
  private rightClickStartPos = { x: 0, y: 0 };
  private isRightClickDragging = false;

  // Callbacks
  private onSelectNode?: (id: string | null, e?: PointerEvent) => void;
  private onSelectEdge?: (id: string | null, clientX?: number, clientY?: number) => void;
  private onHoverNode?: (id: string | null) => void;
  private onConnectNodes?: (sourceId: string, targetId: string) => void;
  private onConnectCancel?: () => void;
  private onNodeContextMenu?: (id: string | null, clientX: number, clientY: number) => void;

  constructor(
    canvas: HTMLCanvasElement,
    options: {
      onSelectNode?: (id: string | null, e?: PointerEvent) => void;
      onSelectEdge?: (id: string | null, clientX?: number, clientY?: number) => void;
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
      if (existing && existing.x !== undefined) {
        n.x = existing.x;
        n.y = existing.y;
        n.vx = existing.vx;
        n.vy = existing.vy;
        n.fx = existing.fx;
        n.fy = existing.fy;
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
    if (this.justConnected) {
      this.justConnected = false;
      return;
    }
    if (this.isRightClickDragging) {
      this.isRightClickDragging = false;
      this.rightClickSourceId = null;
      return;
    }
    this.rightClickSourceId = null;

    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = this.screenToWorld(screenX, screenY);

    // If connection mode is active, right-clicking on or near target node completes connection!
    if (this.connectingSourceId) {
      const targetNode =
        this.findCandidateTargetNode(worldPos.x, worldPos.y, this.connectingSourceId) ||
        (this.hoveredNodeId && this.hoveredNodeId !== this.connectingSourceId
          ? this.nodesMap.get(this.hoveredNodeId)
          : null);

      if (targetNode && targetNode.id !== this.connectingSourceId) {
        if (this.onConnectNodes) {
          this.onConnectNodes(this.connectingSourceId, targetNode.id);
        }
        this.justConnected = true;
        this.connectingSourceId = null;
        this.isDraggingNode = false;
        this.dragNodeId = null;
        this.canvas.style.cursor = 'grab';
        return;
      } else {
        // Right-click on empty canvas: cancel connection
        this.connectingSourceId = null;
        this.canvas.style.cursor = 'grab';
        if (this.onConnectCancel) this.onConnectCancel();
        return;
      }
    }

    const hitNode = this.hitTest(worldPos.x, worldPos.y, 16);
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
    // Screen-space adaptive hit tolerance: at least 20 screen pixels
    const hitTolerance = Math.max(20, 24 / Math.max(0.05, this.camera.zoom));
    const hitToleranceSq = hitTolerance * hitTolerance;

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

      let midX = (x1 + x2) / 2;
      let midY = (y1 + y2) / 2;
      const isCurved = Boolean(this.displayConfig?.curvedEdges);

      if (isCurved) {
        midX = (x1 + x2) / 2 - dy * 0.15;
        midY = (y1 + y2) / 2 + dx * 0.15;
      }

      // Check direct hit on midpoint or label pill
      const labelW = Math.max(50, (edge.label?.length || 8) * 8.5);
      const pillHalfW = labelW / 2 + 14;
      const pillHalfH = 16;
      if (
        worldX >= midX - pillHalfW &&
        worldX <= midX + pillHalfW &&
        worldY >= midY - pillHalfH &&
        worldY <= midY + pillHalfH
      ) {
        return edge;
      }

      // Bounding box quick check
      const minX = Math.min(x1, x2, midX) - hitTolerance;
      const maxX = Math.max(x1, x2, midX) + hitTolerance;
      const minY = Math.min(y1, y2, midY) - hitTolerance;
      const maxY = Math.max(y1, y2, midY) + hitTolerance;
      if (worldX < minX || worldX > maxX || worldY < minY || worldY > maxY) {
        continue;
      }

      if (isCurved) {
        // Sample quadratic bezier curve in 24 segments for smooth, exact curved edge hit testing
        let prevPx = x1;
        let prevPy = y1;
        let isHit = false;

        for (let s = 1; s <= 24; s++) {
          const t = s / 24;
          const oneMinusT = 1 - t;
          const px = oneMinusT * oneMinusT * x1 + 2 * oneMinusT * t * midX + t * t * x2;
          const py = oneMinusT * oneMinusT * y1 + 2 * oneMinusT * t * midY + t * t * y2;

          const segDx = px - prevPx;
          const segDy = py - prevPy;
          const segLenSq = segDx * segDx + segDy * segDy;
          if (segLenSq > 0) {
            let segT = ((worldX - prevPx) * segDx + (worldY - prevPy) * segDy) / segLenSq;
            segT = Math.max(0, Math.min(1, segT));
            const projX = prevPx + segT * segDx;
            const projY = prevPy + segT * segDy;
            const dSq = (worldX - projX) * (worldX - projX) + (worldY - projY) * (worldY - projY);
            if (dSq <= hitToleranceSq) {
              isHit = true;
              break;
            }
          }
          prevPx = px;
          prevPy = py;
        }

        if (isHit) return edge;
      }

      // Also test straight line segment
      let t = ((worldX - x1) * dx + (worldY - y1) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const projX = x1 + t * dx;
      const projY = y1 + t * dy;
      const distSq = (worldX - projX) * (worldX - projX) + (worldY - projY) * (worldY - projY);
      if (distSq <= hitToleranceSq) {
        return edge;
      }
    }
    return null;
  }

  public findCandidateTargetNode(
    worldX: number,
    worldY: number,
    excludeId?: string | null
  ): GraphNode | null {
    // 1. Direct hit-test with generous tolerance (radius + 20px, or label pill)
    const directHit = this.hitTest(worldX, worldY, 20);
    if (directHit && (!excludeId || directHit.id !== excludeId)) {
      return directHit;
    }

    // 2. Magnetic snap: calculate snap distance in screen pixels so it works at any zoom level
    const screenSnapPx = 75;
    const worldSnapDist = Math.max(90, screenSnapPx / Math.max(0.1, this.camera.zoom));
    const maxDistSq = worldSnapDist * worldSnapDist;

    let closest: GraphNode | null = null;
    let minDistanceSq = maxDistSq;

    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      if (excludeId && node.id === excludeId) continue;
      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const dx = worldX - nx;
      const dy = worldY - ny;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDistanceSq) {
        minDistanceSq = distSq;
        closest = node;
      }
    }

    return closest;
  }

  private onPointerDown(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = this.screenToWorld(screenX, screenY);

    // Active connection flow (either initiated via connect button, right-click, or HUD)
    if (this.connectingSourceId) {
      const targetNode =
        this.findCandidateTargetNode(worldPos.x, worldPos.y, this.connectingSourceId) ||
        (this.hoveredNodeId && this.hoveredNodeId !== this.connectingSourceId
          ? this.nodesMap.get(this.hoveredNodeId)
          : null);

      if (targetNode && targetNode.id !== this.connectingSourceId) {
        if (this.onConnectNodes) {
          this.onConnectNodes(this.connectingSourceId, targetNode.id);
        }
        this.justConnected = true;
        this.connectingSourceId = null;
        this.isDraggingNode = false;
        this.dragNodeId = null;
        this.canvas.style.cursor = 'grab';
        return;
      } else {
        // Cancel if clicked empty canvas or outside any node
        this.connectingSourceId = null;
        this.isDraggingNode = false;
        this.dragNodeId = null;
        this.canvas.style.cursor = 'grab';
        if (this.onConnectCancel) this.onConnectCancel();
        return;
      }
    }

    // Handle right-click (button 2) for right-click drag to connect
    if (e.button === 2) {
      const hitNode = this.hitTest(worldPos.x, worldPos.y, 16);
      if (hitNode) {
        this.rightClickSourceId = hitNode.id;
        this.rightClickStartPos = { x: screenX, y: screenY };
        this.isRightClickDragging = false;
      } else {
        this.rightClickSourceId = null;
        this.isRightClickDragging = false;
      }
      return;
    }

    const hitNode = this.hitTest(worldPos.x, worldPos.y, 14);

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
        this.selectedEdgeId = hitEdge.id;
        this.selectedNodeId = null;
        this.isPanning = false;
        if (this.onSelectEdge) this.onSelectEdge(hitEdge.id, e.clientX, e.clientY);
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

    // Detect right-click drag motion from node
    if (this.rightClickSourceId) {
      const dist = Math.hypot(screenX - this.rightClickStartPos.x, screenY - this.rightClickStartPos.y);
      if (dist > 4) {
        this.isRightClickDragging = true;
        this.connectingSourceId = this.rightClickSourceId;
      }
    }

    if (this.connectingSourceId) {
      const target = this.findCandidateTargetNode(worldPos.x, worldPos.y, this.connectingSourceId);
      this.hoveredNodeId = target ? target.id : null;
      if (this.onHoverNode) {
        this.onHoverNode(this.hoveredNodeId);
      }
      this.canvas.style.cursor = target ? 'pointer' : 'crosshair';
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
      // Hover detection for both nodes and edges
      const hitNode = this.hitTest(worldPos.x, worldPos.y, 14);
      if (hitNode) {
        this.hoveredEdgeId = null;
        this.canvas.style.cursor = 'pointer';
        if (this.onHoverNode) {
          this.onHoverNode(hitNode.id);
        }
      } else {
        const hitEdge = this.hitTestEdge(worldPos.x, worldPos.y);
        this.hoveredEdgeId = hitEdge ? hitEdge.id : null;
        this.canvas.style.cursor = hitEdge ? 'pointer' : 'grab';
        if (this.onHoverNode) {
          this.onHoverNode(null);
        }
      }
    }
  }

  private onPointerUp(e: PointerEvent) {
    if (this.connectingSourceId) {
      const rect = this.canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldPos = this.screenToWorld(screenX, screenY);
      const targetNode =
        this.findCandidateTargetNode(worldPos.x, worldPos.y, this.connectingSourceId) ||
        (this.hoveredNodeId && this.hoveredNodeId !== this.connectingSourceId
          ? this.nodesMap.get(this.hoveredNodeId)
          : null);

      if (targetNode && targetNode.id !== this.connectingSourceId) {
        if (this.onConnectNodes) {
          this.onConnectNodes(this.connectingSourceId, targetNode.id);
        }
        this.justConnected = true;
      } else if (this.isRightClickDragging) {
        // Suppress context menu if dragged and released outside
        this.justConnected = true;
      }

      this.connectingSourceId = null;
      this.rightClickSourceId = null;
      this.isRightClickDragging = false;
      this.isDraggingNode = false;
      this.dragNodeId = null;
      this.canvas.style.cursor = 'grab';
      if (this.onConnectCancel) this.onConnectCancel();
      return;
    }

    this.rightClickSourceId = null;
    this.isRightClickDragging = false;

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

  private hitTest(worldX: number, worldY: number, extraTolerance = 14): GraphNode | null {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const r = (node.size || 20) * (this.displayConfig?.nodeScale || 1.0);
      const radius = r + extraTolerance;

      const dx = worldX - nx;
      const dy = worldY - ny;
      if (dx * dx + dy * dy <= radius * radius) {
        return node;
      }

      // Check label pill below node if labels are shown
      if (this.displayConfig?.showLabels && node.label) {
        const labelY = ny + r + 6;
        const approxTextWidth = Math.max(40, node.label.length * 8);
        const halfW = approxTextWidth / 2 + 10;
        const fontSize = this.displayConfig?.labelSize || 12;
        if (
          worldX >= nx - halfW &&
          worldX <= nx + halfW &&
          worldY >= labelY - 4 &&
          worldY <= labelY + fontSize + 10
        ) {
          return node;
        }
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
        const hitTarget = this.findCandidateTargetNode(
          this.mouseWorldPos.x,
          this.mouseWorldPos.y,
          this.connectingSourceId
        );
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
        this.ctx.strokeStyle = hitTarget ? '#22d3ee' : '#06b6d4';
        this.ctx.lineWidth = hitTarget ? 2.5 : 2;
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

        // Target hover highlight ring + soft cyan glow
        if (hitTarget && hitTarget.id !== this.connectingSourceId) {
          const tgtRadius = ((hitTarget.size || 20) * this.displayConfig.nodeScale) + 8;
          this.ctx.beginPath();
          this.ctx.arc(hitTarget.x ?? 0, hitTarget.y ?? 0, tgtRadius, 0, Math.PI * 2);
          this.ctx.strokeStyle = '#22d3ee';
          this.ctx.lineWidth = 2.5;
          this.ctx.stroke();

          this.ctx.fillStyle = 'rgba(34, 211, 238, 0.2)';
          this.ctx.fill();
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
    const isHovered = Boolean(this.hoveredEdgeId && edge.id === this.hoveredEdgeId);

    this.ctx.save();
    this.ctx.globalAlpha = isDimmed ? 0.2 : (isSelected || isHovered ? 1.0 : (isHighlighted ? 0.95 : 0.7));

    this.ctx.strokeStyle = isSelected
      ? '#38bdf8'
      : (isHovered ? '#67e8f9' : (isHighlighted ? '#818cf8' : (edge.color || '#94a3b8')));
    this.ctx.lineWidth = isSelected
      ? 3.2
      : (isHovered ? 2.6 : (isHighlighted ? this.displayConfig.linkThickness * 2 : this.displayConfig.linkThickness * 1.5));

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
      this.ctx.fillStyle = isSelected ? '#38bdf8' : (isHovered ? '#67e8f9' : (isHighlighted ? '#818cf8' : '#64748b'));
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

    // Edge Label Pill (if selected, hovered, or showLabels enabled at reasonable zoom)
    const shouldShowLabel = isSelected || isHovered || (this.displayConfig.showLabels && this.camera.zoom >= 0.85);
    if (shouldShowLabel && edge.label) {
      this.ctx.save();
      this.ctx.font = isSelected || isHovered ? 'bold 11px sans-serif' : '10px sans-serif';
      const textWidth = this.ctx.measureText(edge.label).width;
      this.ctx.fillStyle = isSelected
        ? 'rgba(8, 47, 73, 0.95)'
        : (isHovered ? 'rgba(15, 23, 42, 0.95)' : 'rgba(15, 23, 42, 0.85)');
      this.ctx.beginPath();
      this.ctx.roundRect(midX - textWidth / 2 - 8, midY - 11, textWidth + 16, 22, 6);
      this.ctx.fill();
      this.ctx.strokeStyle = isSelected ? '#38bdf8' : (isHovered ? '#67e8f9' : 'rgba(148, 163, 184, 0.4)');
      this.ctx.lineWidth = isSelected ? 2 : (isHovered ? 1.5 : 1);
      this.ctx.stroke();
      this.ctx.fillStyle = isSelected ? '#38bdf8' : (isHovered ? '#67e8f9' : '#cbd5e1');
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
