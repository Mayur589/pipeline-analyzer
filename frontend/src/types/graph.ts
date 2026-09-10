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

export type NodeCategory = {
  id: string;
  category: string;
  defaultProperties: string[];
  description?: string;
  iconName?: string;
  color?: string;
  borderAccent?: string;
  bgAccent?: string;
  fieldDefs?: PropertyFieldDef[];
};

export type CreateNodeInput = {
  projectId: string;
  categoryId: string;
  properties: Map<string, any> | Record<string, any>;
  position?: { x: number; y: number };
};

export type Node = {
  id: string;
  projectId: string;
  categoryId: string;
  properties: Map<string, any> | Record<string, any>;
  position?: { x: number; y: number };
};

export type CreateEdgeInput = {
  projectId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationship: string;
};

export type Edge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationship: string;
};

export type Graph = {
  projectId: string;
  nodes: Node[];
  edges: Edge[];
};

// Helper function to safely read a property from Record or Map
export function getProperty(properties: Map<string, any> | Record<string, any> | undefined, key: string): any {
  if (!properties) return undefined;
  if (properties instanceof Map) {
    return properties.get(key);
  }
  return (properties as Record<string, any>)[key];
}

// Helper function to convert Record or Map to a plain object
export function propertiesToObject(properties: Map<string, any> | Record<string, any> | undefined): Record<string, any> {
  if (!properties) return {};
  if (properties instanceof Map) {
    return Object.fromEntries(properties.entries());
  }
  return { ...properties };
}
