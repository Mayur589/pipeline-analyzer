import type { CreateNodeInput, Node, NodeProperties } from '../types/graph';
import { getOrCreateProjectGraph, mockDb, generateId } from './db';

export async function insertNode(input: CreateNodeInput): Promise<Node> {
  // Simulate network roundtrip
  await new Promise((resolve) => setTimeout(resolve, 60));

  const projectGraph = getOrCreateProjectGraph(input.projectId || 'default-pipeline');

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

export async function updateNode(
  nodeId: string,
  properties: NodeProperties,
  projectId: string = 'default-pipeline'
): Promise<Node> {
  // Simulate network roundtrip
  await new Promise((resolve) => setTimeout(resolve, 40));

  const projectGraph = getOrCreateProjectGraph(projectId);
  const targetNode = projectGraph.nodes.find((n) => n.id === nodeId);

  if (!targetNode) {
    throw new Error(`Node with id ${nodeId} not found`);
  }

  targetNode.properties = properties;
  return targetNode;
}

export async function deleteNode(nodeId: string, _projectId: string = 'default-pipeline'): Promise<void> {
  // Simulate network roundtrip
  await new Promise((resolve) => setTimeout(resolve, 60));

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
