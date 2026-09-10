import type { Node, Edge } from '../types/graph';

// In-memory mock database state
interface MockDatabase {
  graphs: Record<string, { nodes: Node[]; edges: Edge[] }>;
}

export const mockDb: MockDatabase = {
  graphs: {
    'default-pipeline': {
      nodes: [],
      edges: []
    }
  }
};

export function getOrCreateProjectGraph(projectId: string): { nodes: Node[]; edges: Edge[] } {
  if (!mockDb.graphs[projectId]) {
    mockDb.graphs[projectId] = {
      nodes: [],
      edges: []
    };
  }
  return mockDb.graphs[projectId];
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
}

