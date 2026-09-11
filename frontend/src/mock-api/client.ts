import { getNodeTypes } from './nodeTypes';
import { getRelationships, getValidRelationships } from './relationships';
import { createProject, getProjects, getProject } from './projects';
import { getGraph } from './graph';
import { insertNode, updateNode, deleteNode } from './nodes';
import { insertEdge, updateEdge, deleteEdge } from './edges';

export interface ApiRequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: any;
}

/**
 * Unified Dispatcher that handles exact endpoint path strings:
 * - GET    /node-types
 * - GET    /relationships
 * - GET    /relationships/validate?sourceCategory=...&targetCategory=...
 * - POST   /projects
 * - GET    /projects
 * - GET    /projects/{project_id}/graph
 * - POST   /projects/{project_id}/nodes
 * - PATCH  /nodes/{node_id}
 * - DELETE /nodes/{node_id}
 * - POST   /projects/{project_id}/edges
 * - PATCH  /edges/{edge_id}
 * - DELETE /edges/{edge_id}
 */
export async function apiDispatch<T = any>(req: ApiRequestOptions): Promise<T> {
  const { method, path, query, body } = req;

  // 1. /node-types
  if (method === 'GET' && path === '/node-types') {
    return (await getNodeTypes()) as unknown as T;
  }

  // 2. /relationships/validate
  if (method === 'GET' && path === '/relationships/validate') {
    const sourceCategory = query?.sourceCategory || '';
    const targetCategory = query?.targetCategory || '';
    const res = getValidRelationships(sourceCategory, targetCategory);
    return {
      valid: res.valid,
      allowedRelationshipIds: res.relationships.map((r) => r.id)
    } as unknown as T;
  }

  // 3. /relationships
  if (method === 'GET' && path === '/relationships') {
    return (await getRelationships()) as unknown as T;
  }

  // 4. /projects
  if (method === 'POST' && path === '/projects') {
    return (await createProject(body)) as unknown as T;
  }
  if (method === 'GET' && path === '/projects') {
    return (await getProjects()) as unknown as T;
  }
  const projectSingleMatch = path.match(/^\/projects\/([^/]+)$/);
  if (method === 'GET' && projectSingleMatch) {
    const projectId = decodeURIComponent(projectSingleMatch[1]);
    return (await getProject(projectId)) as unknown as T;
  }

  // 5. /projects/{project_id}/graph
  const projectGraphMatch = path.match(/^\/projects\/([^/]+)\/graph$/);
  if (method === 'GET' && projectGraphMatch) {
    const projectId = decodeURIComponent(projectGraphMatch[1]);
    return (await getGraph(projectId)) as unknown as T;
  }

  // 6. /projects/{project_id}/nodes
  const projectNodesMatch = path.match(/^\/projects\/([^/]+)\/nodes$/);
  if (method === 'POST' && projectNodesMatch) {
    const projectId = decodeURIComponent(projectNodesMatch[1]);
    return (await insertNode({
      projectId,
      categoryId: body.categoryId,
      properties: body.properties,
      position: body.position
    })) as unknown as T;
  }

  // 7 & 8. /nodes/{node_id}
  const nodeMatch = path.match(/^\/nodes\/([^/]+)$/);
  if (nodeMatch) {
    const nodeId = decodeURIComponent(nodeMatch[1]);
    if (method === 'PATCH') {
      return (await updateNode(nodeId, body.properties || {})) as unknown as T;
    }
    if (method === 'DELETE') {
      return (await deleteNode(nodeId)) as unknown as T;
    }
  }

  // 9. /projects/{project_id}/edges
  const projectEdgesMatch = path.match(/^\/projects\/([^/]+)\/edges$/);
  if (method === 'POST' && projectEdgesMatch) {
    const projectId = decodeURIComponent(projectEdgesMatch[1]);
    return (await insertEdge({
      projectId,
      sourceNodeId: body.sourceNodeId,
      targetNodeId: body.targetNodeId,
      relationshipId: body.relationshipId
    })) as unknown as T;
  }

  // 10 & 11. /edges/{edge_id}
  const edgeMatch = path.match(/^\/edges\/([^/]+)$/);
  if (edgeMatch) {
    const edgeId = decodeURIComponent(edgeMatch[1]);
    if (method === 'PATCH') {
      return (await updateEdge(edgeId, body.relationshipId)) as unknown as T;
    }
    if (method === 'DELETE') {
      return (await deleteEdge(edgeId)) as unknown as T;
    }
  }

  throw new Error(`Endpoint not found: ${method} ${path}`);
}
