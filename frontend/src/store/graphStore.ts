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
import { insertNode, deleteNode } from '../mock-api/nodes';
import { insertEdge, deleteEdge } from '../mock-api/edges';

export interface PendingDropState {
  categoryId: string;
  position: { x: number; y: number };
}

export interface PendingConnectionState {
  sourceNodeId: string;
  targetNodeId: string;
}

interface GraphStoreState {
  // Core Graph State
  projectId: string;
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  nodeCategories: NodeCategory[];

  // UI / Dialog States
  isLoading: boolean;
  isSidebarCollapsed: boolean;
  pendingDrop: PendingDropState | null;
  isNodeDialogOpen: boolean;
  pendingConnection: PendingConnectionState | null;
  isEdgeDialogOpen: boolean;

  // Actions
  loadGraph: (projectId?: string) => Promise<void>;
  loadNodeTypes: () => Promise<void>;
  addNode: (input: Omit<CreateNodeInput, 'projectId'>) => Promise<Node>;
  removeNode: (nodeId: string) => Promise<void>;
  addEdge: (input: Omit<CreateEdgeInput, 'projectId'>) => Promise<Edge>;
  removeEdge: (edgeId: string) => Promise<void>;
  selectNode: (nodeId: string | null) => void;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;

  // Modal / UI actions
  setPendingDrop: (drop: PendingDropState | null) => void;
  openNodeDialog: (drop: PendingDropState) => void;
  closeNodeDialog: () => void;
  openEdgeDialog: (conn: PendingConnectionState) => void;
  closeEdgeDialog: () => void;
  toggleSidebar: () => void;
  clearCanvas: () => void;
}

export const useGraphStore = create<GraphStoreState>((set, get) => ({
  projectId: 'default-pipeline',
  nodes: [],
  edges: [],
  selectedNodeId: null,
  nodeCategories: [],
  isLoading: false,
  isSidebarCollapsed: false,
  pendingDrop: null,
  isNodeDialogOpen: false,
  pendingConnection: null,
  isEdgeDialogOpen: false,

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
    set({ isLoading: true });
    try {
      const createdNode = await insertNode({
        ...input,
        projectId: get().projectId
      });
      set((state) => ({
        nodes: [...state.nodes, createdNode],
        selectedNodeId: createdNode.id,
        isLoading: false,
        pendingDrop: null,
        isNodeDialogOpen: false
      }));
      return createdNode;
    } catch (error) {
      console.error('Failed to insert node:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  removeNode: async (nodeId: string) => {
    set({ isLoading: true });
    try {
      await deleteNode(nodeId, get().projectId);
      set((state) => ({
        nodes: state.nodes.filter((n) => n.id !== nodeId),
        edges: state.edges.filter((e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId),
        selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
        isLoading: false
      }));
    } catch (error) {
      console.error('Failed to delete node:', error);
      set({ isLoading: false });
    }
  },

  addEdge: async (input) => {
    set({ isLoading: true });
    try {
      const createdEdge = await insertEdge({
        ...input,
        projectId: get().projectId
      });
      set((state) => {
        // Replace existing edge if identical connection exists or append new
        const exists = state.edges.some((e) => e.id === createdEdge.id);
        const nextEdges = exists
          ? state.edges.map((e) => (e.id === createdEdge.id ? createdEdge : e))
          : [...state.edges, createdEdge];

        return {
          edges: nextEdges,
          isLoading: false,
          pendingConnection: null,
          isEdgeDialogOpen: false
        };
      });
      return createdEdge;
    } catch (error) {
      console.error('Failed to insert edge:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  removeEdge: async (edgeId: string) => {
    try {
      await deleteEdge(edgeId);
      set((state) => ({
        edges: state.edges.filter((e) => e.id !== edgeId)
      }));
    } catch (error) {
      console.error('Failed to delete edge:', error);
    }
  },

  selectNode: (nodeId: string | null) => {
    set({ selectedNodeId: nodeId });
  },

  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => {
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, position } : n))
    }));
  },

  setPendingDrop: (drop) => set({ pendingDrop: drop }),
  openNodeDialog: (drop) => set({ pendingDrop: drop, isNodeDialogOpen: true }),
  closeNodeDialog: () => set({ pendingDrop: null, isNodeDialogOpen: false }),
  openEdgeDialog: (conn) => set({ pendingConnection: conn, isEdgeDialogOpen: true }),
  closeEdgeDialog: () => set({ pendingConnection: null, isEdgeDialogOpen: false }),
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  clearCanvas: () => set({ nodes: [], edges: [], selectedNodeId: null })
}));
