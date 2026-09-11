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

export interface Graph {
  projectId: string;
  nodes: Node[];
  edges: Edge[];
}

export type {
  RelationshipDefinition,
  RelationshipRule,
  RelationshipErrorCode,
  RelationshipErrorPayload
} from '../mock-api/relationships';
export {
  SemanticGraphError,
  RELATIONSHIP_DEFINITIONS,
  RELATIONSHIPS_BY_ID,
  RELATIONSHIP_RULES,
  getValidRelationships,
  getRelationships,
  getRelationshipColor,
  getRelationshipGroupInfo
} from '../mock-api/relationships';

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

// Centralized generator for category default properties
export function createDefaultProperties(category: NodeCategory): NodeProperties {
  const props: NodeProperties = {};

  const fields = category.fieldDefs || [];
  fields.forEach((fieldDef) => {
    if (fieldDef.defaultValue !== undefined) {
      props[fieldDef.key] = fieldDef.defaultValue;
    } else if (fieldDef.key === 'name') {
      props[fieldDef.key] = category.label || category.category || 'Node';
    } else if (fieldDef.type === 'checkbox') {
      props[fieldDef.key] = true;
    } else {
      props[fieldDef.key] = `${category.label || category.category || ''} Config`;
    }
  });

  return props;
}
