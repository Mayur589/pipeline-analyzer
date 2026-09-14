import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  forceX,
  forceY
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
let degreeMap = new Map<string, number>();

let currentConfig: PhysicsConfig = {
  repulsion: -420,
  linkDistance: 190,
  linkStrength: 0.65,
  gravity: 0.035,
  collisionRadius: 55,
  damping: 0.38,
  enabled: true,
  unconnectedRepulsion: -280,
  unconnectedGravity: 0.04
};

function getDegree(nodeId: string): number {
  return degreeMap.get(nodeId) || 0;
}

function updateDegreeMap() {
  degreeMap.clear();
  currentEdges.forEach((e) => {
    const srcId = typeof e.source === 'object' ? (e.source as WorkerNode).id : e.source;
    const tgtId = typeof e.target === 'object' ? (e.target as WorkerNode).id : e.target;
    degreeMap.set(srcId, (degreeMap.get(srcId) || 0) + 1);
    degreeMap.set(tgtId, (degreeMap.get(tgtId) || 0) + 1);
  });
}

self.onmessage = (event: MessageEvent<WorkerInitMessage>) => {
  const { type, nodes, edges, config, nodeId, x, y } = event.data;

  if (type === 'init') {
    if (!nodes || !edges || !config) return;

    currentConfig = config;
    const count = nodes.length;
    const baseRadius = Math.max(160, Math.sqrt(count) * 85);
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
      source: typeof e.source === 'object' ? (e.source as WorkerNode).id : e.source,
      target: typeof e.target === 'object' ? (e.target as WorkerNode).id : e.target
    }));

    updateDegreeMap();
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
        simulation.alpha(0.15).restart();
      }
    }
  } else if (type === 'reheat') {
    if (simulation) {
      updateDegreeMap();
      updateSimulationForces();
      simulation.alpha(0.6).restart();
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
    .strength(d => {
      const deg = getDegree(d.id);
      // Soft repulsion for unconnected nodes so they never get blasted into deep space
      if (deg === 0) {
        return currentConfig.unconnectedRepulsion ?? Math.max(-280, currentConfig.repulsion * 0.65);
      }
      return currentConfig.repulsion;
    })
    .distanceMin(40)
    .distanceMax(700);

  // Directional centripetal gravity forces to keep unconnected nodes neatly in graph orbit
  const xForce = forceX<WorkerNode>(0).strength(d => {
    const deg = getDegree(d.id);
    return deg === 0
      ? (currentConfig.unconnectedGravity ?? currentConfig.gravity)
      : currentConfig.gravity;
  });

  const yForce = forceY<WorkerNode>(0).strength(d => {
    const deg = getDegree(d.id);
    return deg === 0
      ? (currentConfig.unconnectedGravity ?? currentConfig.gravity)
      : currentConfig.gravity;
  });

  const centerForce = forceCenter<WorkerNode>(0, 0)
    .strength(currentConfig.gravity);

  const collideForce = forceCollide<WorkerNode>()
    .radius(d => (d.size || 8) + currentConfig.collisionRadius)
    .iterations(4);

  simulation = forceSimulation<WorkerNode, WorkerLink>(currentNodes)
    .velocityDecay(currentConfig.damping)
    .force('charge', chargeForce)
    .force('link', linkForce)
    .force('x', xForce)
    .force('y', yForce)
    .force('center', centerForce)
    .force('collide', collideForce);

  // Run fast warmup ticks synchronously to untangle and relax the graph layout
  for (let i = 0; i < 150; i++) {
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

  simulation.alpha(0.25).restart();
}

function updateSimulationForces() {
  if (!simulation) {
    initSimulation();
    return;
  }

  const charge = simulation.force('charge') as ReturnType<typeof forceManyBody>;
  if (charge) {
    charge.strength((d: any) => {
      const deg = getDegree(d.id);
      if (deg === 0) {
        return currentConfig.unconnectedRepulsion ?? Math.max(-280, currentConfig.repulsion * 0.65);
      }
      return currentConfig.repulsion;
    });
    charge.distanceMin(40);
    charge.distanceMax(700);
  }

  const link = simulation.force('link') as ReturnType<typeof forceLink>;
  if (link) {
    link.distance(currentConfig.linkDistance);
    link.strength(currentConfig.linkStrength);
  }

  const xForce = simulation.force('x') as ReturnType<typeof forceX>;
  if (xForce) {
    xForce.strength((d: any) => {
      const deg = getDegree(d.id);
      return deg === 0
        ? (currentConfig.unconnectedGravity ?? Math.max(0.08, currentConfig.gravity * 2.2))
        : currentConfig.gravity;
    });
  }

  const yForce = simulation.force('y') as ReturnType<typeof forceY>;
  if (yForce) {
    yForce.strength((d: any) => {
      const deg = getDegree(d.id);
      return deg === 0
        ? (currentConfig.unconnectedGravity ?? Math.max(0.08, currentConfig.gravity * 2.2))
        : currentConfig.gravity;
    });
  }

  const center = simulation.force('center') as ReturnType<typeof forceCenter>;
  if (center) center.strength(currentConfig.gravity);

  const collide = simulation.force('collide') as ReturnType<typeof forceCollide>;
  if (collide) collide.radius(d => ((d as WorkerNode).size || 20) + currentConfig.collisionRadius);

  simulation.velocityDecay(currentConfig.damping);
  if (currentConfig.enabled) {
    simulation.alpha(0.25).restart();
  } else {
    simulation.stop();
  }
}

