import type {
  NodeCategory,
  PropertyFieldDef,
  Project,
  Graph,
  Node,
  Edge,
  NodeProperties,
  AttackSimulationResult,
  ScenarioInfo
} from '../types/graph';
import { getRelationshipColor } from '../types/graph.ts';

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

interface BackendAttackStep {
  EdgeId: string;
  SourceNodeId: string;
  TargetNodeId: string;
  Relationship: string;
  Outcome: 'COMPROMISED' | 'SLOWED' | 'BLOCKED' | 'DETECTED';
  Reason: string;
  ControlsTriggered: string[];
  Phase?: string;
  Reverse?: boolean;
}

interface BackendSeverityScore {
  Score: number;
  Label: 'Critical' | 'High' | 'Medium' | 'Low';
}

interface BackendAttackSimulationResult {
  AttackId: string;
  ProjectId: string;
  StartNodeId: string;
  Scenario: string;
  Steps: BackendAttackStep[];
  CompromisedNodeIds: string[];
  BlockedNodeIds: string[];
  DetectedAtStep: number | null;
  OverallSeverity: BackendSeverityScore;
  WormGenerations?: number;
  ExposedSecretIds?: string[];
}

interface BackendKeyControl {
  CategoryId: string;
  PropertyKey: string;
}

interface BackendScenarioInfo {
  Id: string;
  Name: string;
  Description: string;
  ValidStartCategories: string[];
  DefaultStartCategory: string;
  KeyControls: BackendKeyControl[];
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
  const metaEnv = (import.meta as unknown as { env?: Record<string, string> })?.env;
  const procEnv = (globalThis as unknown as { process?: { env?: Record<string, string> } })?.process?.env;
  const custom = metaEnv?.VITE_API_BASE_URL || procEnv?.VITE_API_BASE_URL;
  return custom && custom.trim() ? custom.trim() : 'http://127.0.0.1:3000';
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
// 1. Metadata Endpoints (Dynamic, Zero Hardcoded Domain Logic)
// -------------------------------------------------------------

/**
 * GET /node-types
 * Returns all node categories and dynamic field definitions directly from the backend.
 */
export async function getNodeTypes(): Promise<NodeCategory[]> {
  const data = await request<BackendNodeCategory[]>('/node-types', { method: 'GET' });

  return data.map((cat) => {
    const label = cat.Id
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const color = getRelationshipColor(cat.Id);

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
      category: label,
      label,
      description: `${label} component`,
      color,
      fieldDefs,
      defaultProperties: fieldDefs.map((f) => f.key)
    };
  });
}

/**
 * GET /relationships
 * Returns the list of all supported relationship string IDs directly from backend.
 */
export async function getRelationships(): Promise<string[]> {
  return request<string[]>('/relationships', { method: 'GET' });
}

/** GET /scenarios: supported scenarios and their start guidance. */
export async function getScenarios(): Promise<ScenarioInfo[]> {
  const data = await request<BackendScenarioInfo[]>('/scenarios', { method: 'GET' });
  return data.map((scenario) => ({
    id: scenario.Id,
    name: scenario.Name,
    description: scenario.Description,
    validStartCategories: scenario.ValidStartCategories,
    defaultStartCategory: scenario.DefaultStartCategory,
    keyControls: scenario.KeyControls.map((control) => ({
      categoryId: control.CategoryId,
      propertyKey: control.PropertyKey
    }))
  }));
}

/**
 * GET /relationships/validate
 * Validates connection between sourceCategory and targetCategory via backend.
 */
export async function validateRelationship(
  sourceCategory: string,
  targetCategory: string
): Promise<{ valid: boolean; allowedRelationshipIds: string[] }> {
  if (!sourceCategory || !targetCategory) {
    return { valid: false, allowedRelationshipIds: [] };
  }

  const query = new URLSearchParams({
    SourceCategory: sourceCategory,
    TargetCategory: targetCategory
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
    console.warn(`Validation request failed for ${sourceCategory} -> ${targetCategory}:`, err);
    return { valid: false, allowedRelationshipIds: [] };
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
 * PATCH /projects/{project_id}
 * Edits the name of the project.
 */
export async function editProject(projectId: string, name: string): Promise<Project> {
  const data = await request<BackendProject>(`/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ Name: name })
  });
  return {
    id: data.Id,
    name: data.Name
  };
}

/**
 * DELETE /projects/{project_id}
 * Deletes a project and cascades all its nodes and edges.
 */
export async function deleteProject(projectId: string): Promise<void> {
  await request<null>(`/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE'
  });
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

// -------------------------------------------------------------
// 5. Attack Simulation Endpoints (/projects/{project_id}/attack)
// -------------------------------------------------------------

/**
 * POST /projects/{project_id}/attack
 * Runs an attack simulation starting from a given node.
 */
export async function simulateAttack(
  projectId: string,
  startNodeId: string,
  scenario: string
): Promise<AttackSimulationResult> {
  const data = await request<BackendAttackSimulationResult>(
    `/projects/${encodeURIComponent(projectId)}/attack`,
    {
      method: 'POST',
      body: JSON.stringify({
        StartNodeId: startNodeId,
        Scenario: scenario
      })
    }
  );
  return {
    attackId: data.AttackId,
    projectId: data.ProjectId,
    startNodeId: data.StartNodeId,
    scenario: data.Scenario,
    steps: (data.Steps || []).map((s) => ({
      edgeId: s.EdgeId,
      sourceNodeId: s.SourceNodeId,
      targetNodeId: s.TargetNodeId,
      relationship: s.Relationship,
      outcome: s.Outcome,
      reason: s.Reason,
      controlsTriggered: s.ControlsTriggered || [],
      phase: s.Phase,
      reverse: s.Reverse
    })),
    compromisedNodeIds: data.CompromisedNodeIds || [],
    blockedNodeIds: data.BlockedNodeIds || [],
    detectedAtStep: data.DetectedAtStep,
    overallSeverity: {
      score: data.OverallSeverity?.Score ?? 0,
      label: data.OverallSeverity?.Label ?? 'Low'
    },
    wormGenerations: data.WormGenerations,
    exposedSecretIds: data.ExposedSecretIds
  };
}

export const api = {
  getNodeTypes,
  getRelationships,
  getScenarios,
  validateRelationship,
  getProjects,
  createProject,
  editProject,
  deleteProject,
  getGraph,
  createNode,
  editNode,
  deleteNode,
  createEdge,
  editEdge,
  deleteEdge,
  simulateAttack
};
