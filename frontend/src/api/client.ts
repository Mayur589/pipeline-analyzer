import type {
  NodeCategory,
  PropertyFieldDef,
  Project,
  Graph,
  Node,
  Edge,
  NodeProperties
} from '../types/graph';

/**
 * Category UI presentation metadata (colors, friendly labels, descriptions).
 * The dynamic field definitions themselves are loaded directly from GET /node-types.
 */
const CATEGORY_UI_METADATA: Record<string, { label: string; description: string; color: string }> = {
  identity_people: {
    label: 'Identity & People',
    description: 'Developers, admins, service accounts, and IAM roles accessing the pipeline.',
    color: '#0ea5e9'
  },
  source_control: {
    label: 'Source Control',
    description: 'Repositories, version control systems, and code review governance.',
    color: '#6366f1'
  },
  dependencies: {
    label: 'Dependencies',
    description: 'Third-party open-source libraries, vendored code, and software packages.',
    color: '#f59e0b'
  },
  build_environment: {
    label: 'Build Environment',
    description: 'Compilers, build workers, sandboxes, and base OS container images.',
    color: '#ec4899'
  },
  cicd_pipeline: {
    label: 'CI/CD Pipeline',
    description: 'Workflows, orchestration engines, automated test suites, and gates.',
    color: '#14b8a6'
  },
  secrets_credentials: {
    label: 'Secrets & Credentials',
    description: 'API keys, signing certificates, deployment tokens, and KMS keys.',
    color: '#eab308'
  },
  artifact_storage: {
    label: 'Artifact Storage',
    description: 'Container registries, package managers, and signed binary stores.',
    color: '#8b5cf6'
  },
  distribution: {
    label: 'Distribution',
    description: 'CDNs, package repositories, app stores, and customer release channels.',
    color: '#10b981'
  },
  runtime_environment: {
    label: 'Runtime Environment',
    description: 'Kubernetes clusters, serverless platforms, cloud VMs, and production nodes.',
    color: '#06b6d4'
  },
  monitoring_response: {
    label: 'Monitoring & Response',
    description: 'SIEM platforms, audit loggers, runtime guards, and anomaly detection.',
    color: '#f43f5e'
  }
};

/**
 * Backend Data Transfer Object (DTO) types matching Rust Axum serializers
 */
interface BackendFieldDef {
  Key: string;
  Ty: 'string' | 'select' | 'boolean' | string;
  Options: string[] | null;
  DefaultValue: any;
}

interface BackendNodeCategory {
  Id: string;
  FieldDefs: BackendFieldDef[];
}

interface BackendProject {
  Id: string;
  Name: string;
}

interface BackendNode {
  Id: string;
  CategoryId: string;
  Properties: NodeProperties;
}

interface BackendEdge {
  Id: string;
  SourceNodeId: string;
  TargetNodeId: string;
  Relationship: string;
}

interface BackendGraph {
  ProjectId: string;
  Nodes: BackendNode[];
  Edges: BackendEdge[];
}

interface BackendErrorResponse {
  code?: string;
  message?: string;
}

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const getBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    // In browser: relative URLs delegate directly to Vite proxy to avoid CORS
    const custom = (import.meta as any)?.env?.VITE_API_BASE_URL;
    return custom !== undefined ? custom : '';
  }
  // In Node / CLI test runner
  const proc = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process;
  return proc?.env?.API_BASE_URL || 'http://127.0.0.1:3000';
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    let errorCode = `HTTP_${res.status}`;
    let errorMessage = `Request to ${path} failed with status ${res.status}`;

    try {
      const errBody: BackendErrorResponse = await res.json();
      if (errBody.code) errorCode = errBody.code;
      if (errBody.message) errorMessage = errBody.message;
    } catch {
      // Body not JSON, keep default message
    }

    throw new ApiError(res.status, errorCode, errorMessage);
  }

  // Handle empty or null response (e.g. 200 OK with null for DELETE)
  const text = await res.text();
  if (!text) return null as unknown as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

// -------------------------------------------------------------
// 1. Metadata Endpoints
// -------------------------------------------------------------

/**
 * GET /node-types
 * Returns all node categories and dynamic field definitions.
 */
export async function getNodeTypes(): Promise<NodeCategory[]> {
  const data = await request<BackendNodeCategory[]>('/node-types', { method: 'GET' });

  return data.map((cat) => {
    const meta = CATEGORY_UI_METADATA[cat.Id] || {
      label: cat.Id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description: `Category for ${cat.Id}`,
      color: '#0ea5e9'
    };

    const fieldDefs: PropertyFieldDef[] = (cat.FieldDefs || []).map((f) => {
      let fieldType: PropertyFieldDef['type'] = 'text';
      if (f.Ty === 'select') fieldType = 'select';
      else if (f.Ty === 'boolean') fieldType = 'checkbox';

      return {
        key: f.Key,
        label: f.Key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase()),
        type: fieldType,
        options: f.Options || undefined,
        defaultValue: f.DefaultValue
      };
    });

    return {
      id: cat.Id,
      category: meta.label,
      label: meta.label,
      description: meta.description,
      color: meta.color,
      fieldDefs,
      defaultProperties: fieldDefs.map((f) => f.key)
    };
  });
}

/**
 * GET /relationships
 * Returns the list of all supported relationship string IDs.
 */
export async function getRelationships(): Promise<string[]> {
  return request<string[]>('/relationships', { method: 'GET' });
}

/**
 * GET /relationships/validate
 * Validates connection between sourceCategory and targetCategory.
 */
export async function validateRelationship(
  sourceCategory: string,
  targetCategory: string
): Promise<{ valid: boolean; allowedRelationshipIds: string[] }> {
  const query = new URLSearchParams({
    source_category: sourceCategory,
    target_category: targetCategory
  });

  try {
    const allowed = await request<string[]>(`/relationships/validate?${query.toString()}`, {
      method: 'GET'
    });
    return {
      valid: Array.isArray(allowed) && allowed.length > 0,
      allowedRelationshipIds: allowed || []
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) {
      return { valid: false, allowedRelationshipIds: [] };
    }
    throw err;
  }
}

// -------------------------------------------------------------
// 2. Project Endpoints
// -------------------------------------------------------------

/**
 * GET /projects
 * Returns all projects.
 */
export async function getProjects(): Promise<Project[]> {
  const data = await request<BackendProject[]>('/projects', { method: 'GET' });
  return data.map((p) => ({
    id: p.Id,
    name: p.Name
  }));
}

/**
 * POST /projects
 * Creates a new project.
 */
export async function createProject(name: string): Promise<Project> {
  const data = await request<BackendProject>('/projects', {
    method: 'POST',
    body: JSON.stringify({ Name: name })
  });
  return {
    id: data.Id,
    name: data.Name
  };
}

/**
 * GET /projects/{project_id}/graph
 * Fetches the entire graph for a project.
 */
export async function getGraph(projectId: string): Promise<Graph> {
  const data = await request<BackendGraph>(`/projects/${encodeURIComponent(projectId)}/graph`, {
    method: 'GET'
  });

  return {
    projectId: data.ProjectId,
    nodes: (data.Nodes || []).map((n) => ({
      id: n.Id,
      categoryId: n.CategoryId,
      properties: n.Properties || {}
    })),
    edges: (data.Edges || []).map((e) => ({
      id: e.Id,
      sourceNodeId: e.SourceNodeId,
      targetNodeId: e.TargetNodeId,
      relationshipId: e.Relationship
    }))
  };
}

// -------------------------------------------------------------
// 3. Node Endpoints (/projects/{project_id}/nodes)
// -------------------------------------------------------------

/**
 * POST /projects/{project_id}/nodes
 * Creates a new node in the project.
 */
export async function createNode(
  projectId: string,
  categoryId: string,
  properties: NodeProperties
): Promise<Node> {
  const data = await request<BackendNode>(`/projects/${encodeURIComponent(projectId)}/nodes`, {
    method: 'POST',
    body: JSON.stringify({
      CategoryId: categoryId,
      Properties: properties
    })
  });

  return {
    id: data.Id,
    categoryId: data.CategoryId,
    properties: data.Properties || {},
    projectId
  };
}

/**
 * PATCH /projects/{project_id}/nodes/{node_id}
 * Updates an existing node's properties.
 */
export async function editNode(
  projectId: string,
  nodeId: string,
  properties: NodeProperties
): Promise<Node> {
  const data = await request<BackendNode>(
    `/projects/${encodeURIComponent(projectId)}/nodes/${encodeURIComponent(nodeId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        Properties: properties
      })
    }
  );

  return {
    id: data.Id,
    categoryId: data.CategoryId,
    properties: data.Properties || {},
    projectId
  };
}

/**
 * DELETE /projects/{project_id}/nodes/{node_id}
 * Deletes a node and cascades all connected edges.
 */
export async function deleteNode(projectId: string, nodeId: string): Promise<void> {
  await request<null>(
    `/projects/${encodeURIComponent(projectId)}/nodes/${encodeURIComponent(nodeId)}`,
    {
      method: 'DELETE'
    }
  );
}

// -------------------------------------------------------------
// 4. Edge Endpoints (/projects/{project_id}/edges)
// -------------------------------------------------------------

/**
 * POST /projects/{project_id}/edges
 * Creates an edge between two nodes.
 */
export async function createEdge(
  projectId: string,
  sourceNodeId: string,
  targetNodeId: string,
  relationshipId: string
): Promise<Edge> {
  const data = await request<BackendEdge>(`/projects/${encodeURIComponent(projectId)}/edges`, {
    method: 'POST',
    body: JSON.stringify({
      SourceNodeId: sourceNodeId,
      TargetNodeId: targetNodeId,
      Relationship: relationshipId
    })
  });

  return {
    id: data.Id,
    sourceNodeId: data.SourceNodeId,
    targetNodeId: data.TargetNodeId,
    relationshipId: data.Relationship
  };
}

/**
 * PATCH /projects/{project_id}/edges/{edge_id}
 * Updates an edge's relationship.
 */
export async function editEdge(
  projectId: string,
  edgeId: string,
  relationshipId: string
): Promise<Edge> {
  const data = await request<BackendEdge>(
    `/projects/${encodeURIComponent(projectId)}/edges/${encodeURIComponent(edgeId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        Relationship: relationshipId
      })
    }
  );

  return {
    id: data.Id,
    sourceNodeId: data.SourceNodeId,
    targetNodeId: data.TargetNodeId,
    relationshipId: data.Relationship
  };
}

/**
 * DELETE /projects/{project_id}/edges/{edge_id}
 * Deletes an edge.
 */
export async function deleteEdge(projectId: string, edgeId: string): Promise<void> {
  await request<null>(
    `/projects/${encodeURIComponent(projectId)}/edges/${encodeURIComponent(edgeId)}`,
    {
      method: 'DELETE'
    }
  );
}

export const api = {
  getNodeTypes,
  getRelationships,
  validateRelationship,
  getProjects,
  createProject,
  getGraph,
  createNode,
  editNode,
  deleteNode,
  createEdge,
  editEdge,
  deleteEdge
};
