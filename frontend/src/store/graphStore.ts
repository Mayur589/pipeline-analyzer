import { create } from 'zustand';
import type {
  Node,
  Edge,
  NodeCategory,
  CreateNodeInput,
  CreateEdgeInput,
  NodeProperties,
  Project
} from '../types/graph';
import {
  api,
  validateRelationship
} from '../api/client';
import { SemanticGraphError } from '../mock-api/relationships';

// Local position cache to preserve canvas coordinates across graph re-fetches
const nodePositionCache = new Map<string, { x: number; y: number }>();

interface GraphStoreState {
  // Project & Multi-project state
  projects: Project[];
  projectId: string;

  // Core Graph State
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  nodeCategories: NodeCategory[];

  // UI States
  isLoading: boolean;

  // Actions
  loadProjects: () => Promise<Project[]>;
  selectProject: (projectId: string) => Promise<void>;
  createNewProject: (name: string, description?: string) => Promise<Project>;
  loadGraph: (projectIdOverride?: string) => Promise<void>;
  loadNodeTypes: () => Promise<void>;
  addNode: (input: Omit<CreateNodeInput, 'projectId'>) => Promise<Node>;
  updateNodeProperties: (nodeId: string, properties: NodeProperties) => Promise<void>;
  removeNode: (nodeId: string) => Promise<void>;
  addEdge: (input: Omit<CreateEdgeInput, 'projectId'>) => Promise<Edge>;
  updateEdgeRelationship: (edgeId: string, relationshipId: string) => Promise<void>;
  reverseEdge: (edgeId: string) => Promise<void>;
  removeEdge: (edgeId: string) => Promise<void>;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  clearSelection: () => void;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  clearCanvas: () => void;
}

export const useGraphStore = create<GraphStoreState>((set, get) => ({
  projects: [],
  projectId: '',
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  nodeCategories: [],
  isLoading: false,

  loadProjects: async () => {
    try {
      const projects = await api.getProjects();
      set({ projects });

      // If no active project or active project not in list, pick the first or create a default
      let currentId = get().projectId;
      if (!currentId || !projects.some((p) => p.id === currentId)) {
        if (projects.length > 0) {
          currentId = projects[0].id;
          set({ projectId: currentId });
          await get().loadGraph(currentId);
        } else {
          const defaultProj = await api.createProject('Default Pipeline');
          set({ projects: [defaultProj], projectId: defaultProj.id });
          await get().loadGraph(defaultProj.id);
        }
      }

      return projects;
    } catch (error) {
      console.error('Failed to load projects:', error);
      return [];
    }
  },

  selectProject: async (projectId: string) => {
    if (projectId === get().projectId) return;
    set({ projectId, selectedNodeId: null, selectedEdgeId: null });
    await get().loadGraph(projectId);
  },

  createNewProject: async (name: string) => {
    try {
      const newProj = await api.createProject(name);
      set((state) => ({
        projects: [...state.projects, newProj],
        projectId: newProj.id,
        nodes: [],
        edges: [],
        selectedNodeId: null,
        selectedEdgeId: null
      }));
      return newProj;
    } catch (error) {
      console.error('Failed to create project:', error);
      throw error;
    }
  },

  loadNodeTypes: async () => {
    try {
      const categories = await api.getNodeTypes();
      set({ nodeCategories: categories });
    } catch (error) {
      console.error('Failed to load node types:', error);
    }
  },

  loadGraph: async (projectIdOverride?: string) => {
    const pid = projectIdOverride || get().projectId;
    if (!pid) return;

    set({ isLoading: true, projectId: pid });
    try {
      const graph = await api.getGraph(pid);

      // Hydrate with cached positions if available
      const nodesWithPosition = graph.nodes.map((n) => ({
        ...n,
        position: nodePositionCache.get(n.id) || n.position
      }));

      set({
        nodes: nodesWithPosition,
        edges: graph.edges,
        isLoading: false
      });
    } catch (error) {
      console.error('Failed to load graph:', error);
      set({ isLoading: false });
    }
  },

  addNode: async (input) => {
    const pid = get().projectId;
    if (!pid) {
      throw new Error('Cannot add node: No active project selected.');
    }

    try {
      const createdNode = await api.createNode(pid, input.categoryId, input.properties);

      // Cache position if provided
      if (input.position) {
        nodePositionCache.set(createdNode.id, input.position);
      }

      const nodeWithPos: Node = {
        ...createdNode,
        position: input.position
      };

      set((state) => ({
        nodes: [...state.nodes, nodeWithPos],
        selectedNodeId: nodeWithPos.id,
        selectedEdgeId: null
      }));

      return nodeWithPos;
    } catch (error) {
      console.error('Failed to insert node:', error);
      throw error;
    }
  },

  updateNodeProperties: async (nodeId: string, properties: NodeProperties) => {
    const pid = get().projectId;
    // Optimistic local update
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, properties: { ...properties } } : n
      )
    }));

    try {
      await api.editNode(pid, nodeId, properties);
    } catch (error) {
      console.error('Failed to update node properties:', error);
    }
  },

  removeNode: async (nodeId: string) => {
    const pid = get().projectId;
    try {
      await api.deleteNode(pid, nodeId);
      nodePositionCache.delete(nodeId);

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
    const pid = get().projectId;
    if (!pid) throw new Error('Cannot add edge: No active project.');

    const tempId = `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const optimisticEdge: Edge = {
      id: tempId,
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
      relationshipId: input.relationshipId
    };

    // Immediate local update so the connection renders instantaneously
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
      const createdEdge = await api.createEdge(
        pid,
        input.sourceNodeId,
        input.targetNodeId,
        input.relationshipId
      );

      set((state) => ({
        edges: state.edges.map((e) => (e.id === tempId ? createdEdge : e)),
        selectedEdgeId: createdEdge.id
      }));

      return createdEdge;
    } catch (error) {
      // Revert optimistic edge on error
      set((state) => ({
        edges: state.edges.filter((e) => e.id !== tempId)
      }));
      console.error('Failed to insert edge:', error);
      throw error;
    }
  },

  updateEdgeRelationship: async (edgeId: string, relationshipId: string) => {
    const pid = get().projectId;
    // Optimistic local update
    set((state) => ({
      edges: state.edges.map((e) =>
        e.id === edgeId ? { ...e, relationshipId } : e
      )
    }));

    try {
      await api.editEdge(pid, edgeId, relationshipId);
    } catch (error) {
      console.error('Failed to update edge relationship:', error);
    }
  },

  reverseEdge: async (edgeId: string) => {
    const pid = get().projectId;
    const edge = get().edges.find((e) => e.id === edgeId);
    if (!edge) return;
    const newSourceId = edge.targetNodeId;
    const newTargetId = edge.sourceNodeId;

    const sourceNode = get().nodes.find((n) => n.id === newSourceId);
    const targetNode = get().nodes.find((n) => n.id === newTargetId);

    if (!sourceNode || !targetNode) return;

    // Validate if reversed direction has a valid rule
    const valid = await validateRelationship(sourceNode.categoryId, targetNode.categoryId);
    if (!valid.valid || valid.allowedRelationshipIds.length === 0) {
      console.warn(
        `Cannot reverse edge: connection from "${sourceNode.categoryId}" to "${targetNode.categoryId}" is invalid.`
      );
      throw new SemanticGraphError({
        code: 'INVALID_CATEGORY_CONNECTION',
        message: `Cannot reverse direction: category "${sourceNode.categoryId}" cannot connect to "${targetNode.categoryId}".`
      });
    }

    const newRelId = valid.allowedRelationshipIds[0];

    // Optimistic update
    set((state) => ({
      edges: state.edges.map((e) =>
        e.id === edgeId
          ? { ...e, sourceNodeId: newSourceId, targetNodeId: newTargetId, relationshipId: newRelId }
          : e
      )
    }));

    try {
      await api.deleteEdge(pid, edgeId);
      const recreated = await api.createEdge(pid, newSourceId, newTargetId, newRelId);
      set((state) => ({
        edges: state.edges.map((e) => (e.id === edgeId ? recreated : e)),
        selectedEdgeId: recreated.id
      }));
    } catch (error) {
      console.error('Failed to reverse edge on backend:', error);
      // Revert on error
      set((state) => ({
        edges: state.edges.map((e) => (e.id === edgeId ? edge : e))
      }));
      throw error;
    }
  },

  removeEdge: async (edgeId: string) => {
    const pid = get().projectId;
    try {
      await api.deleteEdge(pid, edgeId);
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
    nodePositionCache.set(nodeId, position);
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, position } : n))
    }));
  },

  clearCanvas: () => {
    set({ nodes: [], edges: [], selectedNodeId: null, selectedEdgeId: null });
  }
}));
