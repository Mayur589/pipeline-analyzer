import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide
} from 'd3-force';
import type {
  Simulation,
  SimulationNodeDatum,
  SimulationLinkDatum
} from 'd3-force';
import type { PhysicsConfig } from '../types/graph';

export interface WorkerNode extends SimulationNodeDatum {
  id: string;
  size?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface WorkerLink extends SimulationLinkDatum<WorkerNode> {
  id: string;
  source: string | WorkerNode;
  target: string | WorkerNode;
}

interface WorkerInitMessage {
  type: 'init' | 'updateConfig' | 'dragNode' | 'dragEnd' | 'reheat';
  nodes?: WorkerNode[];
  edges?: WorkerLink[];
  config?: PhysicsConfig;
  nodeId?: string;
  x?: number;
  y?: number;
}

let simulation: Simulation<WorkerNode, WorkerLink> | null = null;
let nodesMap = new Map<string, WorkerNode>();
let currentNodes: WorkerNode[] = [];
let currentEdges: WorkerLink[] = [];
let currentConfig: PhysicsConfig = {
  repulsion: -600,
  linkDistance: 190,
  linkStrength: 0.35,
  gravity: 0.02,
  collisionRadius: 36,
  damping: 0.42,
  enabled: true
};

self.onmessage = (event: MessageEvent<WorkerInitMessage>) => {
  const { type, nodes, edges, config, nodeId, x, y } = event.data;

  if (type === 'init') {
    if (!nodes || !edges || !config) return;

    currentConfig = config;
    const count = nodes.length;
    const baseRadius = Math.max(220, Math.sqrt(count) * 110);
    const goldenAngle = 2.3999632; // ~137.5 degrees

    currentNodes = nodes.map((n, i) => {
      const existing = nodesMap.get(n.id);
      const angle = i * goldenAngle;
      const r = count > 1 ? Math.sqrt((i + 1) / count) * baseRadius : 0;
      const initialX = Math.cos(angle) * r;
      const initialY = Math.sin(angle) * r;

      return {
        id: n.id,
        size: n.size || 8,
        x: existing?.x ?? n.x ?? initialX,
        y: existing?.y ?? n.y ?? initialY,
        vx: existing?.vx ?? n.vx ?? 0,
        vy: existing?.vy ?? n.vy ?? 0,
        fx: n.fx ?? existing?.fx ?? null,
        fy: n.fy ?? existing?.fy ?? null
      };
    });

    nodesMap.clear();
    currentNodes.forEach(n => nodesMap.set(n.id, n));

    currentEdges = edges.map(e => ({
      id: e.id,
      source: typeof e.source === 'object' ? e.source.id : e.source,
      target: typeof e.target === 'object' ? e.target.id : e.target
    }));

    initSimulation();
  } else if (type === 'updateConfig') {
    if (config) {
      currentConfig = config;
      updateSimulationForces();
    }
  } else if (type === 'dragNode') {
    if (nodeId && simulation) {
      const node = nodesMap.get(nodeId);
      if (node) {
        node.fx = x;
        node.fy = y;
        simulation.alphaTarget(0.3).restart();
      }
    }
  } else if (type === 'dragEnd') {
    if (nodeId && simulation) {
      const node = nodesMap.get(nodeId);
      if (node) {
        node.fx = null;
        node.fy = null;
        simulation.alphaTarget(0);
      }
    }
  } else if (type === 'reheat') {
    if (simulation) {
      simulation.alpha(0.8).restart();
    }
  }
};

function initSimulation() {
  if (simulation) {
    simulation.stop();
  }

  if (!currentConfig.enabled) return;

  const linkForce = forceLink<WorkerNode, WorkerLink>(currentEdges)
    .id(d => d.id)
    .distance(currentConfig.linkDistance)
    .strength(currentConfig.linkStrength);

  const chargeForce = forceManyBody<WorkerNode>()
    .strength(currentConfig.repulsion)
    .distanceMax(2000);

  const centerForce = forceCenter<WorkerNode>(0, 0)
    .strength(currentConfig.gravity);

  const collideForce = forceCollide<WorkerNode>()
    .radius(d => (d.size || 8) + currentConfig.collisionRadius)
    .iterations(3);

  simulation = forceSimulation<WorkerNode, WorkerLink>(currentNodes)
    .velocityDecay(currentConfig.damping)
    .force('charge', chargeForce)
    .force('link', linkForce)
    .force('center', centerForce)
    .force('collide', collideForce);

  // Run 100 fast warmup ticks synchronously to untangle and relax the graph layout
  for (let i = 0; i < 100; i++) {
    simulation.tick();
  }

  // Immediately publish the untangled positions so first frame is perfectly spaced
  const initialPositions = currentNodes.map(n => ({
    id: n.id,
    x: n.x,
    y: n.y,
    vx: n.vx,
    vy: n.vy
  }));
  self.postMessage({ type: 'tick', positions: initialPositions });

  // Stream subsequent ticks for smooth interactive settling and dragging
  simulation.on('tick', () => {
    const positions = currentNodes.map(n => ({
      id: n.id,
      x: n.x,
      y: n.y,
      vx: n.vx,
      vy: n.vy
    }));
    self.postMessage({ type: 'tick', positions });
  });

  simulation.alpha(0.3).restart();
}

function updateSimulationForces() {
  if (!simulation) {
    initSimulation();
    return;
  }

  const charge = simulation.force('charge') as ReturnType<typeof forceManyBody>;
  if (charge) charge.strength(currentConfig.repulsion);

  const link = simulation.force('link') as ReturnType<typeof forceLink>;
  if (link) {
    link.distance(currentConfig.linkDistance);
    link.strength(currentConfig.linkStrength);
  }

  const center = simulation.force('center') as ReturnType<typeof forceCenter>;
  if (center) center.strength(currentConfig.gravity);

  const collide = simulation.force('collide') as ReturnType<typeof forceCollide>;
  if (collide) collide.radius(d => ((d as WorkerNode).size || 20) + currentConfig.collisionRadius);

  simulation.velocityDecay(currentConfig.damping);
  if (currentConfig.enabled) {
    simulation.alpha(0.3).restart();
  } else {
    simulation.stop();
  }
}
