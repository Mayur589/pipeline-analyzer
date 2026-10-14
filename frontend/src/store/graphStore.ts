import { create } from 'zustand';
import type {
  Node,
  Edge,
  NodeCategory,
  CreateNodeInput,
  CreateEdgeInput,
  NodeProperties,
  Project,
  AttackSimulationResult,
  ScenarioInfo
} from '../types/graph';
import {
  api,
  validateRelationship
} from '../api/client';

// In-memory position cache to preserve coordinates across graph re-fetches
const nodePositionCache = new Map<string, { x: number; y: number }>();

interface GraphStoreState {
  // Projects state
  projects: Project[];
  projectId: string;

  // Graph state
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  connectSourceId: string | null;
  nodeCategories: NodeCategory[];
  allRelationships: string[];
  scenarios: ScenarioInfo[];

  // Mode state
  appMode: 'edit' | 'attack';

  // Attack simulation state
  attackResult: AttackSimulationResult | null;
  isSimulatingAttack: boolean;
  attackError: string | null;
  activeStepIndex: number;
  isPlayingSimulation: boolean;
  simulationPlaybackSpeed: number;
  selectedScenario: string;
  focusNodeRequest: { nodeId: string; requestId: number } | null;

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions
  setAppMode: (mode: 'edit' | 'attack') => void;
  setSelectedScenario: (scenario: string) => void;
  runAttackSimulation: (startNodeId: string, scenario?: string) => Promise<AttackSimulationResult | null>;
  clearAttackSimulation: () => void;
  setActiveStepIndex: (index: number) => void;
  requestNodeFocus: (nodeId: string) => void;
  setIsPlayingSimulation: (isPlaying: boolean) => void;
  nextSimulationStep: () => void;
  prevSimulationStep: () => void;
  setSimulationPlaybackSpeed: (speedMs: number) => void;
  initialize: () => Promise<void>;
  loadProjects: () => Promise<Project[]>;
  selectProject: (projectId: string) => Promise<void>;
  createNewProject: (name: string, description?: string) => Promise<Project>;
  updateProject: (projectId: string, name: string) => Promise<Project>;
  deleteProject: (projectId: string) => Promise<void>;
  loadGraph: (projectIdOverride?: string) => Promise<void>;
  loadNodeTypes: () => Promise<void>;
  addNode: (input: Omit<CreateNodeInput, 'projectId'>) => Promise<Node>;
  updateNodeProperties: (nodeId: string, properties: NodeProperties) => Promise<void>;
  removeNode: (nodeId: string) => Promise<void>;
  addEdge: (input: Omit<CreateEdgeInput, 'projectId'>) => Promise<Edge>;
  updateEdgeRelationship: (edgeId: string, relationshipId: string) => Promise<void>;
  reverseEdge: (edgeId: string) => Promise<void>;
  removeEdge: (edgeId: string) => Promise<void>;
  validateConnection: (
    sourceCategoryId: string,
    targetCategoryId: string
  ) => Promise<{ valid: boolean; allowedRelationshipIds: string[] }>;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  setConnectSourceId: (nodeId: string | null) => void;
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
  connectSourceId: null,
  nodeCategories: [],
  allRelationships: [],
  scenarios: [],
  appMode: 'edit',
  attackResult: null,
  isSimulatingAttack: false,
  attackError: null,
  activeStepIndex: -1,
  isPlayingSimulation: false,
  simulationPlaybackSpeed: 800,
  selectedScenario: 'ChainDrop',
  focusNodeRequest: null,
  isLoading: false,
  error: null,

  setAppMode: (mode) => {
    if (mode === 'attack') {
      set({ appMode: mode, connectSourceId: null });
    } else {
      set({
        appMode: mode,
        attackResult: null,
        activeStepIndex: -1,
        isPlayingSimulation: false,
        attackError: null
      });
    }
  },

  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      // Concurrently load node categories, relationships, and scenario metadata
      const [categories, relationships, scenarios] = await Promise.all([
        api.getNodeTypes(),
        api.getRelationships(),
        api.getScenarios()
      ]);

      set({ nodeCategories: categories, allRelationships: relationships, scenarios });

      // Load projects and active graph
      await get().loadProjects();
    } catch (err: any) {
      console.error('Initialization failed:', err);
      set({ error: err.message || 'Failed to initialize from backend.' });
    } finally {
      set({ isLoading: false });
    }
  },

  loadProjects: async () => {
    try {
      const projects = await api.getProjects();
      set({ projects });

      let currentId = get().projectId;
      if (!currentId || !projects.some((p) => p.id === currentId)) {
        if (projects.length > 0) {
          currentId = projects[0].id;
          set({ projectId: currentId });
          await get().loadGraph(currentId);
        } else {
          // No projects exist yet; leave the workspace empty until the user
          // creates one or loads the sample.
          set({ projectId: '' });
        }
      }

      return projects;
    } catch (error: any) {
      console.error('Failed to load projects from backend:', error);
      set({ error: error.message || 'Failed to load projects.' });
      return [];
    }
  },

  selectProject: async (projectId: string) => {
    if (projectId === get().projectId) return;
    set({
      projectId,
      selectedNodeId: null,
      selectedEdgeId: null,
      connectSourceId: null,
      attackResult: null,
      activeStepIndex: -1,
      isPlayingSimulation: false,
      attackError: null
    });
    await get().loadGraph(projectId);
  },

  createNewProject: async (name: string) => {
    set({ isLoading: true, error: null });
    try {
      const newProj = await api.createProject(name);
      set((state) => ({
        projects: [...state.projects, newProj],
        projectId: newProj.id,
        nodes: [],
        edges: [],
        selectedNodeId: null,
        selectedEdgeId: null,
        isLoading: false
      }));
      return newProj;
    } catch (error: any) {
      console.error('Failed to create project:', error);
      set({ error: error.message || 'Failed to create project.', isLoading: false });
      throw error;
    }
  },

  updateProject: async (projectId: string, name: string) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await api.editProject(projectId, name);
      set((state) => ({
        projects: state.projects.map((p) => (p.id === projectId ? updated : p)),
        isLoading: false
      }));
      return updated;
    } catch (error: any) {
      console.error('Failed to update project:', error);
      set({ error: error.message || 'Failed to update project.', isLoading: false });
      throw error;
    }
  },

  deleteProject: async (projectId: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.deleteProject(projectId);
      const remainingProjects = get().projects.filter((p) => p.id !== projectId);

      if (get().projectId === projectId) {
        if (remainingProjects.length > 0) {
          const nextProject = remainingProjects[0];
          set({
            projects: remainingProjects,
            projectId: nextProject.id,
            selectedNodeId: null,
            selectedEdgeId: null,
            connectSourceId: null
          });
          await get().loadGraph(nextProject.id);
        } else {
          // No projects remain; clear the active workspace instead of
          // recreating a default project.
          set({
            projects: [],
            projectId: '',
            nodes: [],
            edges: [],
            selectedNodeId: null,
            selectedEdgeId: null,
            connectSourceId: null
          });
        }
      } else {
        set({ projects: remainingProjects });
      }
    } catch (error: any) {
      console.error('Failed to delete project:', error);
      set({ error: error.message || 'Failed to delete project.' });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  loadNodeTypes: async () => {
    try {
      const categories = await api.getNodeTypes();
      set({ nodeCategories: categories });
    } catch (error: any) {
      console.error('Failed to load node types from backend:', error);
      set({ error: error.message || 'Failed to load node types.' });
    }
  },

  loadGraph: async (projectIdOverride?: string) => {
    const pid = projectIdOverride || get().projectId;
    if (!pid) return;

    set({ isLoading: true, projectId: pid, error: null });
    try {
      const graph = await api.getGraph(pid);

      // Hydrate with in-memory cached positions if available
      const nodesWithPosition = graph.nodes.map((n) => ({
        ...n,
        position: nodePositionCache.get(n.id) || n.position
      }));

      set({
        nodes: nodesWithPosition,
        edges: graph.edges,
        isLoading: false
      });
    } catch (error: any) {
      console.error('Failed to load graph from backend:', error);
      set({ isLoading: false, error: error.message || 'Failed to load graph.' });
    }
  },

  addNode: async (input) => {
    const pid = get().projectId;
    if (!pid) throw new Error('Cannot add node: No active project selected.');

    try {
      const createdNode = await api.createNode(pid, input.categoryId, input.properties);

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
      console.error('Failed to create node on backend:', error);
      throw error;
    }
  },

  updateNodeProperties: async (nodeId: string, properties: NodeProperties) => {
    const pid = get().projectId;
    // Optimistic update for zero-latency UI
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, properties: { ...properties } } : n
      )
    }));

    try {
      await api.editNode(pid, nodeId, properties);
    } catch (error) {
      console.error('Failed to update node properties on backend:', error);
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
      console.error('Failed to delete node on backend:', error);
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
      set((state) => ({
        edges: state.edges.filter((e) => e.id !== tempId)
      }));
      console.error('Failed to insert edge on backend:', error);
      throw error;
    }
  },

  updateEdgeRelationship: async (edgeId: string, relationshipId: string) => {
    const pid = get().projectId;
    set((state) => ({
      edges: state.edges.map((e) =>
        e.id === edgeId ? { ...e, relationshipId } : e
      )
    }));

    try {
      await api.editEdge(pid, edgeId, relationshipId);
    } catch (error) {
      console.error('Failed to update edge relationship on backend:', error);
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

    // Validate if reversed direction is valid on backend
    const valid = await validateRelationship(sourceNode.categoryId, targetNode.categoryId);
    if (!valid.valid || valid.allowedRelationshipIds.length === 0) {
      throw new Error(
        `Cannot reverse direction: category "${sourceNode.categoryId}" cannot connect to "${targetNode.categoryId}".`
      );
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
      console.error('Failed to delete edge on backend:', error);
    }
  },

  validateConnection: async (sourceCategoryId: string, targetCategoryId: string) => {
    return validateRelationship(sourceCategoryId, targetCategoryId);
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

  setConnectSourceId: (nodeId: string | null) => {
    set({ connectSourceId: nodeId });
  },

  clearSelection: () => {
    set({ selectedNodeId: null, selectedEdgeId: null, connectSourceId: null });
  },

  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => {
    nodePositionCache.set(nodeId, position);
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, position } : n))
    }));
  },

  clearCanvas: () => {
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      attackResult: null,
      activeStepIndex: -1,
      isPlayingSimulation: false,
      attackError: null
    });
  },

  setSelectedScenario: (scenario: string) => {
    set({ selectedScenario: scenario });
  },

  setSimulationPlaybackSpeed: (speedMs: number) => {
    set({ simulationPlaybackSpeed: speedMs });
  },

  runAttackSimulation: async (startNodeId: string, scenario?: string) => {
    const { projectId, selectedScenario } = get();
    if (!projectId) {
      set({ attackError: 'No active project selected' });
      return null;
    }
    const targetScenario = scenario || selectedScenario || 'ChainDrop';
    set({
      isSimulatingAttack: true,
      attackError: null,
      isPlayingSimulation: false,
      selectedNodeId: null,
      selectedEdgeId: null
    });

    try {
      const result = await api.simulateAttack(projectId, startNodeId, targetScenario);
      set({
        attackResult: result,
        activeStepIndex: result.steps.length > 0 ? 0 : -1,
        isPlayingSimulation: false,
        attackError: null
      });
      return result;
    } catch (err: any) {
      console.error('Attack simulation failed:', err);
      const errMsg = err.message || 'Attack simulation failed';
      set({
        attackError: errMsg,
        attackResult: null,
        activeStepIndex: -1,
        isPlayingSimulation: false
      });
      return null;
    } finally {
      set({ isSimulatingAttack: false });
    }
  },

  clearAttackSimulation: () => {
    set({
      attackResult: null,
      activeStepIndex: -1,
      isPlayingSimulation: false,
      attackError: null
    });
  },

  setActiveStepIndex: (index: number) => {
    const { attackResult } = get();
    if (!attackResult) {
      set({ activeStepIndex: -1, isPlayingSimulation: false });
      return;
    }
    const maxIndex = attackResult.steps.length;
    const clamped = Math.max(-1, Math.min(index, maxIndex));
    set({ activeStepIndex: clamped });
  },

  requestNodeFocus: (nodeId: string) => {
    set((state) => ({
      focusNodeRequest: {
        nodeId,
        requestId: (state.focusNodeRequest?.requestId ?? 0) + 1
      }
    }));
  },

  setIsPlayingSimulation: (isPlaying: boolean) => {
    set({ isPlayingSimulation: isPlaying });
  },

  nextSimulationStep: () => {
    const { attackResult, activeStepIndex } = get();
    if (!attackResult || attackResult.steps.length === 0) return;
    if (activeStepIndex < attackResult.steps.length) {
      set({ activeStepIndex: activeStepIndex + 1 });
      if (activeStepIndex + 1 >= attackResult.steps.length) {
        set({ isPlayingSimulation: false });
      }
    } else {
      set({ isPlayingSimulation: false });
    }
  },

  prevSimulationStep: () => {
    const { attackResult, activeStepIndex } = get();
    if (!attackResult || attackResult.steps.length === 0) return;
    if (activeStepIndex > 0) {
      set({ activeStepIndex: activeStepIndex - 1 });
    } else {
      set({ activeStepIndex: 0 });
    }
  }
}));
