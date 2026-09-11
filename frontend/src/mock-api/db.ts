import type { Node, Edge, Project } from '../types/graph';

// In-memory mock database state
interface MockDatabase {
  projects: Record<string, Project>;
  graphs: Record<string, { nodes: Node[]; edges: Edge[] }>;
}

export const mockDb: MockDatabase = {
  projects: {
    'default-pipeline': {
      id: 'default-pipeline',
      name: 'Default Pipeline',
      description: 'Default supply chain security pipeline graph'
    }
  },
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
  if (!mockDb.projects[projectId]) {
    mockDb.projects[projectId] = {
      id: projectId,
      name: projectId,
      description: ''
    };
  }
  return mockDb.graphs[projectId];
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
}

