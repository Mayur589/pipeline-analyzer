import { create } from 'zustand';
import type {
  Node,
  Edge,
  NodeCategory,
  CreateNodeInput,
  CreateEdgeInput
} from '../types/graph';
import { getNodeTypes } from '../mock-api/nodeTypes';
import { getGraph } from '../mock-api/graph';
import { insertNode, updateNode, deleteNode } from '../mock-api/nodes';
import { insertEdge, updateEdge, deleteEdge } from '../mock-api/edges';

interface GraphStoreState {
  // Core Graph State
  projectId: string;
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  nodeCategories: NodeCategory[];

  // UI States
  isLoading: boolean;

  // Actions
  loadGraph: (projectId?: string) => Promise<void>;
  loadNodeTypes: () => Promise<void>;
  addNode: (input: Omit<CreateNodeInput, 'projectId'>) => Promise<Node>;
  updateNodeProperties: (nodeId: string, properties: Record<string, any>) => Promise<void>;
  removeNode: (nodeId: string) => Promise<void>;
  addEdge: (input: Omit<CreateEdgeInput, 'projectId'>) => Promise<Edge>;
  updateEdgeRelationship: (edgeId: string, relationship: string) => Promise<void>;
  removeEdge: (edgeId: string) => Promise<void>;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  clearSelection: () => void;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  clearCanvas: () => void;
}

export const useGraphStore = create<GraphStoreState>((set, get) => ({
  projectId: 'default-pipeline',
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  nodeCategories: [],
  isLoading: false,

  loadNodeTypes: async () => {
    try {
      const categories = await getNodeTypes();
      set({ nodeCategories: categories });
    } catch (error) {
      console.error('Failed to load node types:', error);
    }
  },

  loadGraph: async (projectIdOverride?: string) => {
    const pid = projectIdOverride || get().projectId;
    set({ isLoading: true, projectId: pid });
    try {
      const graph = await getGraph(pid);
      set({
        nodes: graph.nodes,
        edges: graph.edges,
        isLoading: false
      });
    } catch (error) {
      console.error('Failed to load graph:', error);
      set({ isLoading: false });
    }
  },

  addNode: async (input) => {
    try {
      const createdNode = await insertNode({
        ...input,
        projectId: get().projectId
      });
      set((state) => ({
        nodes: [...state.nodes, createdNode],
        selectedNodeId: createdNode.id,
        selectedEdgeId: null
      }));
      return createdNode;
    } catch (error) {
      console.error('Failed to insert node:', error);
      throw error;
    }
  },

  updateNodeProperties: async (nodeId: string, properties: Record<string, any>) => {
    // Optimistic local update
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, properties: { ...properties } } : n
      )
    }));

    try {
      await updateNode(nodeId, properties, get().projectId);
    } catch (error) {
      console.error('Failed to update node properties:', error);
    }
  },

  removeNode: async (nodeId: string) => {
    try {
      await deleteNode(nodeId, get().projectId);
      set((state) => ({
        nodes: state.nodes.filter((n) => n.id !== nodeId),
        edges: state.edges.filter((e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId),
        selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId
      }));
    } catch (error) {
      console.error('Failed to delete node:', error);
    }
  },

  addEdge: async (input) => {
    const tempId = `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const optimisticEdge: Edge = {
      id: tempId,
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
      relationship: input.relationship || 'relates to'
    };

    // Immediate local update so the connection renders instantaneously with 0ms delay
    set((state) => {
      const exists = state.edges.some(
        (e) =>
          (e.sourceNodeId === input.sourceNodeId && e.targetNodeId === input.targetNodeId) ||
          (e.sourceNodeId === input.targetNodeId && e.targetNodeId === input.sourceNodeId)
      );
      if (exists) return state;

      return {
        edges: [...state.edges, optimisticEdge],
        selectedEdgeId: tempId,
        selectedNodeId: null
      };
    });

    try {
      const createdEdge = await insertEdge({
        ...input,
        projectId: get().projectId
      });
      set((state) => ({
        edges: state.edges.map((e) => (e.id === tempId ? createdEdge : e)),
        selectedEdgeId: createdEdge.id
      }));
      return createdEdge;
    } catch (error) {
      set((state) => ({
        edges: state.edges.filter((e) => e.id !== tempId)
      }));
      console.error('Failed to insert edge:', error);
      throw error;
    }
  },

  updateEdgeRelationship: async (edgeId: string, relationship: string) => {
    // Optimistic local update
    set((state) => ({
      edges: state.edges.map((e) =>
        e.id === edgeId ? { ...e, relationship } : e
      )
    }));

    try {
      await updateEdge(edgeId, relationship, get().projectId);
    } catch (error) {
      console.error('Failed to update edge relationship:', error);
    }
  },

  removeEdge: async (edgeId: string) => {
    try {
      await deleteEdge(edgeId);
      set((state) => ({
        edges: state.edges.filter((e) => e.id !== edgeId),
        selectedEdgeId: state.selectedEdgeId === edgeId ? null : state.selectedEdgeId
      }));
    } catch (error) {
      console.error('Failed to delete edge:', error);
    }
  },

  selectNode: (nodeId: string | null) => {
    set({
      selectedNodeId: nodeId,
      selectedEdgeId: nodeId ? null : get().selectedEdgeId
    });
  },

  selectEdge: (edgeId: string | null) => {
    set({
      selectedEdgeId: edgeId,
      selectedNodeId: edgeId ? null : get().selectedNodeId
    });
  },

  clearSelection: () => {
    set({ selectedNodeId: null, selectedEdgeId: null });
  },

  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => {
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, position } : n))
    }));
  },

  clearCanvas: () => set({ nodes: [], edges: [], selectedNodeId: null, selectedEdgeId: null })
}));
