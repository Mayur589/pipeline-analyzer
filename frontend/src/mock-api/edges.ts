import type { CreateEdgeInput, Edge } from '../types/graph';
import { getOrCreateProjectGraph, mockDb, generateId } from './db';
import { getValidRelationships, SemanticGraphError } from './relationships';

export async function insertEdge(input: CreateEdgeInput): Promise<Edge> {
  // Simulate network roundtrip
  await new Promise((resolve) => setTimeout(resolve, 60));

  const projectGraph = getOrCreateProjectGraph(input.projectId || 'default-pipeline');

  // 1. Find source and target nodes
  const sourceNode = projectGraph.nodes.find((n) => n.id === input.sourceNodeId);
  const targetNode = projectGraph.nodes.find((n) => n.id === input.targetNodeId);

  if (!sourceNode) {
    throw new SemanticGraphError({
      code: 'NODE_NOT_FOUND',
      message: `Source node with id "${input.sourceNodeId}" was not found.`
    });
  }

  if (!targetNode) {
    throw new SemanticGraphError({
      code: 'NODE_NOT_FOUND',
      message: `Target node with id "${input.targetNodeId}" was not found.`
    });
  }

  // 2. Read category IDs and validate semantic connection against rule matrix
  const valid = getValidRelationships(sourceNode.categoryId, targetNode.categoryId);

  if (!valid.valid) {
    throw new SemanticGraphError({
      code: 'INVALID_CATEGORY_CONNECTION',
      message: `Cannot connect category "${sourceNode.categoryId}" to "${targetNode.categoryId}". No valid relationships exist in rule matrix.`,
      allowed: []
    });
  }

  // 3. Verify relationshipId is allowed by rule matrix
  const isAllowed = valid.relationships.some((r) => r.id === input.relationshipId);
  if (!isAllowed) {
    throw new SemanticGraphError({
      code: 'INVALID_RELATIONSHIP',
      message: `Relationship "${input.relationshipId}" is not allowed between "${sourceNode.categoryId}" and "${targetNode.categoryId}".`,
      allowed: valid.relationships.map((r) => r.id)
    });
  }

  // 4. Prevent duplicate edges: if edge exists, update relationshipId
  const existing = projectGraph.edges.find(
    (e) => e.sourceNodeId === input.sourceNodeId && e.targetNodeId === input.targetNodeId
  );
  if (existing) {
    existing.relationshipId = input.relationshipId;
    return existing;
  }

  const newEdge: Edge = {
    id: generateId('edge'),
    sourceNodeId: input.sourceNodeId,
    targetNodeId: input.targetNodeId,
    relationshipId: input.relationshipId
  };

  projectGraph.edges.push(newEdge);
  return newEdge;
}

export async function updateEdge(
  edgeId: string,
  relationshipId: string,
  projectId?: string
): Promise<Edge> {
  // Simulate network roundtrip
  await new Promise((resolve) => setTimeout(resolve, 40));

  let targetEdge: Edge | undefined;
  let activeProjectId = projectId;

  if (projectId && mockDb.graphs[projectId]) {
    targetEdge = mockDb.graphs[projectId].edges.find((e) => e.id === edgeId);
  }

  if (!targetEdge) {
    for (const pid of Object.keys(mockDb.graphs)) {
      const e = mockDb.graphs[pid].edges.find((edge) => edge.id === edgeId);
      if (e) {
        targetEdge = e;
        activeProjectId = pid;
        break;
      }
    }
  }

  if (!targetEdge) {
    throw new SemanticGraphError({
      code: 'NODE_NOT_FOUND',
      message: `Edge with id "${edgeId}" not found.`
    });
  }

  const projectGraph = mockDb.graphs[activeProjectId || 'default-pipeline'];
  const sourceNode = projectGraph?.nodes.find((n) => n.id === targetEdge!.sourceNodeId);
  const targetNode = projectGraph?.nodes.find((n) => n.id === targetEdge!.targetNodeId);

  if (sourceNode && targetNode) {
    const valid = getValidRelationships(sourceNode.categoryId, targetNode.categoryId);
    if (!valid.valid || !valid.relationships.some((r) => r.id === relationshipId)) {
      throw new SemanticGraphError({
        code: 'INVALID_RELATIONSHIP',
        message: `Relationship "${relationshipId}" is invalid between "${sourceNode.categoryId}" and "${targetNode.categoryId}".`,
        allowed: valid.relationships.map((r) => r.id)
      });
    }
  }

  targetEdge.relationshipId = relationshipId;
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
