import type { CreateEdgeInput, Edge } from '../types/graph';
import { getOrCreateProjectGraph, mockDb, generateId } from './db';

export async function insertEdge(input: CreateEdgeInput): Promise<Edge> {
  // Simulate network roundtrip
  await new Promise((resolve) => setTimeout(resolve, 60));

  const projectGraph = getOrCreateProjectGraph(input.projectId);

  // Check if identical edge already exists
  const existing = projectGraph.edges.find(
    (e) => e.sourceNodeId === input.sourceNodeId && e.targetNodeId === input.targetNodeId
  );
  if (existing) {
    existing.relationship = input.relationship;
    return existing;
  }

  const newEdge: Edge = {
    id: generateId('edge'),
    sourceNodeId: input.sourceNodeId,
    targetNodeId: input.targetNodeId,
    relationship: input.relationship
  };

  projectGraph.edges.push(newEdge);
  return newEdge;
}

export async function updateEdge(
  edgeId: string,
  relationship: string,
  projectId: string = 'default-pipeline'
): Promise<Edge> {
  // Simulate network roundtrip
  await new Promise((resolve) => setTimeout(resolve, 40));

  const projectGraph = getOrCreateProjectGraph(projectId);
  const targetEdge = projectGraph.edges.find((e) => e.id === edgeId);

  if (!targetEdge) {
    throw new Error(`Edge with id ${edgeId} not found`);
  }

  targetEdge.relationship = relationship;
  return targetEdge;
}

export async function deleteEdge(edgeId: string): Promise<void> {
  // Simulate network roundtrip
  await new Promise((resolve) => setTimeout(resolve, 60));

  for (const pid of Object.keys(mockDb.graphs)) {
    const p = mockDb.graphs[pid];
    p.edges = p.edges.filter((e) => e.id !== edgeId);
  }
}
