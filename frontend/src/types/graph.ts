export type PropertyValue = string | number | boolean;
export type NodeProperties = Record<string, PropertyValue>;

export type PropertyFieldType = 'text' | 'select' | 'checkbox' | 'number';

export interface PropertyFieldDef {
  key: string;
  label: string;
  type: PropertyFieldType;
  options?: string[];
  defaultValue?: PropertyValue;
  placeholder?: string;
  description?: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface NodeCategory {
  id: string;
  category: string;
  label?: string;
  description: string;
  color: string;
  fieldDefs: PropertyFieldDef[];
  defaultProperties?: string[];
}

export interface CreateNodeInput {
  categoryId: string;
  properties: NodeProperties;
  position?: Position;
  projectId?: string;
}

export interface Node {
  id: string;
  categoryId: string;
  properties: NodeProperties;
  position?: Position;
  projectId?: string;
}

export interface CreateEdgeInput {
  sourceNodeId: string;
  targetNodeId: string;
  relationshipId: string;
  projectId?: string;
}

export interface Edge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationshipId: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export interface EditProjectInput {
  name: string;
}

export interface Graph {
  projectId: string;
  nodes: Node[];
  edges: Edge[];
}

export interface RelationshipDefinition {
  id: string;
  label: string;
  description?: string;
}

/**
 * Format any relationship or category ID into human-readable Title Case
 * e.g. "contributes_to" -> "Contributes To", "identity_people" -> "Identity People"
 */
export function formatRelationshipLabel(id: string): string {
  if (!id) return '';
  return id
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const RELATIONSHIP_PALETTE: Record<string, string> = {
  triggers: '#38bdf8',         // Sky cyan
  provides_source: '#34d399',  // Mint green
  authenticates: '#fbbf24',    // Warm amber
  executes: '#a78bfa',         // Indigo / purple
  consumed_by: '#60a5fa',      // Royal blue
  produces: '#2dd4bf',         // Vibrant teal
  provides: '#0ea5e9',         // Deep sky blue
  monitored_by: '#fb7185',     // Rose / coral
  alerts: '#f97316',           // Bright orange
  contributes_to: '#a3e635'    // Lime green
};

export const UNIFIED_CONNECTION_COLOR = '#64748b';

/**
 * Generate a consistent, vibrant color for each distinct relationship type.
 * Used for relationship badges, inspector panels, relationship selector, and relationship pills.
 */
export function getRelationshipColor(id?: string): string {
  if (!id) return '#38bdf8';
  const cleanId = id.toLowerCase().replace(/ /g, '_');
  if (RELATIONSHIP_PALETTE[cleanId]) return RELATIONSHIP_PALETTE[cleanId];
  if (RELATIONSHIP_PALETTE[id]) return RELATIONSHIP_PALETTE[id];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 75%, 60%)`;
}

export function getRelationshipGroupInfo(relationshipId: string) {
  return {
    group: relationshipId,
    color: getRelationshipColor(relationshipId),
    label: formatRelationshipLabel(relationshipId)
  };
}

// Engine types from prj1_graph
export type CustomNodeType = 'document' | 'image' | 'task' | 'code' | 'entity' | 'custom';

export interface TaskItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface SchemaField {
  key: string;
  value: string;
  type?: 'string' | 'number' | 'badge' | 'link';
}

export interface NodeMetadata {
  excerpt?: string;
  wordCount?: number;
  lastModified?: string;
  imageUrl?: string;
  caption?: string;
  width?: number;
  height?: number;
  tasks?: TaskItem[];
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string;
  language?: string;
  codeSnippet?: string;
  schemaFields?: SchemaField[];
  customFields?: NodeProperties;
}

export interface GraphNode {
  id: string;
  label: string;
  type: CustomNodeType;
  tags: string[];
  color?: string;
  size?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  metadata?: NodeMetadata;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  weight?: number;
  type?: 'default' | 'directional' | 'dashed' | 'strong';
  color?: string;
  relationshipColor?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface PhysicsConfig {
  repulsion: number;
  linkDistance: number;
  linkStrength: number;
  gravity: number;
  collisionRadius: number;
  damping: number;
  enabled: boolean;
  unconnectedRepulsion?: number;
  unconnectedGravity?: number;
}

export type ColorByOption = 'type' | 'tag' | 'degree' | 'custom';

export interface DisplayConfig {
  showLabels: boolean;
  labelSize: number;
  linkThickness: number;
  curvedEdges: boolean;
  showArrows: boolean;
  animateParticles: boolean;
  colorBy: ColorByOption;
  nodeScale: number;
  dimNonNeighbors: boolean;
  haloGlow: boolean;
}

export interface FilterConfig {
  searchQuery: string;
  selectedTags: string[];
  selectedTypes: CustomNodeType[];
  hideOrphans: boolean;
  minConnections: number;
}

// Safely get a property from a record
export function getProperty<T extends PropertyValue = PropertyValue>(
  properties: NodeProperties | undefined | null,
  key: string
): T | undefined {
  if (!properties) return undefined;
  return properties[key] as T | undefined;
}

// Ensure properties are a plain object
export function propertiesToObject(
  properties: NodeProperties | undefined | null
): NodeProperties {
  if (!properties) return {};
  return { ...properties };
}

// Centralized generator for category default properties dynamically using backend field definitions
export function createDefaultProperties(category: NodeCategory): NodeProperties {
  const props: NodeProperties = {};

  const fields = category.fieldDefs || [];
  fields.forEach((fieldDef) => {
    if (fieldDef.defaultValue !== undefined && fieldDef.defaultValue !== null) {
      props[fieldDef.key] = fieldDef.defaultValue;
    } else if (fieldDef.key === 'name') {
      props[fieldDef.key] = category.label || category.category || 'Node';
    } else if (fieldDef.type === 'checkbox') {
      props[fieldDef.key] = true;
    } else if (fieldDef.options && fieldDef.options.length > 0) {
      props[fieldDef.key] = fieldDef.options[0];
    } else {
      props[fieldDef.key] = `${category.label || category.category || ''} Config`;
    }
  });

  return props;
}

// -------------------------------------------------------------
// Attack Simulation Types
// -------------------------------------------------------------

export type StepOutcome = 'COMPROMISED' | 'SLOWED' | 'BLOCKED' | 'DETECTED';
export type SeverityLabel = 'Critical' | 'High' | 'Medium' | 'Low';

export interface SeverityScore {
  score: number;
  label: SeverityLabel;
}

export interface AttackStep {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationship: string;
  outcome: StepOutcome;
  reason: string;
  controlsTriggered: string[];
  phase?: string;
  reverse?: boolean;
}

export interface AttackSimulationResult {
  attackId: string;
  projectId: string;
  startNodeId: string;
  scenario: string;
  steps: AttackStep[];
  compromisedNodeIds: string[];
  blockedNodeIds: string[];
  detectedAtStep: number | null;
  overallSeverity: SeverityScore;
  wormGenerations?: number;
  exposedSecretIds?: string[];
}

export interface KeyControl {
  categoryId: string;
  propertyKey: string;
}

export interface ScenarioInfo {
  id: string;
  name: string;
  description: string;
  validStartCategories: string[];
  defaultStartCategory: string;
  keyControls: KeyControl[];
}

export const OUTCOME_COLORS: Record<StepOutcome, string> = {
  COMPROMISED: '#ef4444',
  SLOWED: '#f59e0b',
  BLOCKED: '#10b981',
  DETECTED: '#06b6d4'
};
