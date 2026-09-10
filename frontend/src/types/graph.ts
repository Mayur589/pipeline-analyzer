export type PropertyFieldType = 'text' | 'select' | 'checkbox' | 'number';

export interface PropertyFieldDef {
  key: string;
  label: string;
  type: PropertyFieldType;
  options?: string[];
  defaultValue?: any;
  placeholder?: string;
  description?: string;
}

export interface NodeCategory {
  id: string;
  category: string;
  defaultProperties: string[];
  description?: string;
  color?: string;
  fieldDefs?: PropertyFieldDef[];
}

export interface CreateNodeInput {
  projectId: string;
  categoryId: string;
  properties: Record<string, any>;
  position?: { x: number; y: number };
}

export interface Node {
  id: string;
  projectId: string;
  categoryId: string;
  properties: Record<string, any>;
  position?: { x: number; y: number };
}

export interface CreateEdgeInput {
  projectId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationship: string;
}

export interface Edge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationship: string;
}

export interface Graph {
  projectId: string;
  nodes: Node[];
  edges: Edge[];
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
  customFields?: Record<string, any>;
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
export function getProperty<T = any>(
  properties: Record<string, any> | undefined | null,
  key: string
): T | undefined {
  if (!properties) return undefined;
  return properties[key];
}

// Ensure properties are a plain object
export function propertiesToObject(
  properties: Record<string, any> | undefined | null
): Record<string, any> {
  if (!properties) return {};
  return { ...properties };
}

// Centralized generator for category default properties
export function createDefaultProperties(category: NodeCategory): Record<string, any> {
  const props: Record<string, any> = {};

  category.defaultProperties.forEach((propKey) => {
    const fieldDef = category.fieldDefs?.find((f) => f.key === propKey);
    if (fieldDef?.defaultValue !== undefined) {
      props[propKey] = fieldDef.defaultValue;
    } else if (propKey === 'name') {
      props[propKey] = category.category;
    } else if (
      propKey.toLowerCase().includes('protection') ||
      propKey.toLowerCase().includes('enabled') ||
      propKey.toLowerCase().includes('required') ||
      propKey.toLowerCase().includes('scanning')
    ) {
      props[propKey] = true;
    } else {
      props[propKey] = `${category.category} Config`;
    }
  });

  return props;
}
