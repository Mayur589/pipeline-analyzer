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
