import type { Graph } from '../types/graph';
import { getOrCreateProjectGraph } from './db';

export async function getGraph(projectId: string): Promise<Graph> {
  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, 100));

  const projectGraph = getOrCreateProjectGraph(projectId);

  // Return a copy of the graph
  return {
    projectId,
    nodes: [...projectGraph.nodes],
    edges: [...projectGraph.edges]
  };
}
