import type { CreateNodeInput, Node } from '../types/graph';
import { getOrCreateProjectGraph, mockDb } from './db';

// Generate unique ID locally
function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
}

export async function insertNode(input: CreateNodeInput): Promise<Node> {
  // Simulate network roundtrip
  await new Promise((resolve) => setTimeout(resolve, 100));

  const projectGraph = getOrCreateProjectGraph(input.projectId);

  const newNode: Node = {
    id: generateId('node'),
    projectId: input.projectId,
    categoryId: input.categoryId,
    properties: input.properties,
    position: input.position || {
      x: 150 + Math.random() * 200,
      y: 150 + Math.random() * 200
    }
  };

  projectGraph.nodes.push(newNode);
  return newNode;
}

export async function deleteNode(nodeId: string, _projectId: string = 'default-pipeline'): Promise<void> {
  // Simulate network roundtrip
  await new Promise((resolve) => setTimeout(resolve, 80));

  // Search across projects
  for (const pid of Object.keys(mockDb.graphs)) {
    const p = mockDb.graphs[pid];
    const nodeIndex = p.nodes.findIndex((n) => n.id === nodeId);
    if (nodeIndex !== -1) {
      // Remove node
      p.nodes.splice(nodeIndex, 1);
      // Also remove all connected edges (both as source or target)
      p.edges = p.edges.filter(
        (edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId
      );
      break;
    }
  }
}
