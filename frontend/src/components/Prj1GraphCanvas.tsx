import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useGraphStore } from '../store/graphStore';
import { GraphEngine } from '../engine/GraphEngine';
import { createSearchIndexer } from '../engine/search';
import type {
  GraphNode,
  GraphEdge,
  PhysicsConfig,
  DisplayConfig,
  FilterConfig,
  Node
} from '../types/graph';
import { getProperty, createDefaultProperties } from '../types/graph';
import {
  getRelationshipGroupInfo,
  formatRelationshipLabel
} from '../types/graph';
import type { RelationshipDefinition } from '../types/graph';
import { validateRelationship } from '../api/client';
import {
  Maximize2,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Link2,
  Sliders,
  X,
  Sparkles,
  Layers,
  Search,
  Palette,
  AlertTriangle,
  Check,
  CheckCircle2,
  ShieldAlert
} from 'lucide-react';

const DEFAULT_PHYSICS: PhysicsConfig = {
  repulsion: -380,
  linkDistance: 170,
  linkStrength: 0.7,
  gravity: 0.10,
  collisionRadius: 28,
  damping: 0.45,
  enabled: true
};

const DEFAULT_DISPLAY: DisplayConfig = {
  showLabels: true,
  labelSize: 12,
  linkThickness: 1.2,
  curvedEdges: true,
  showArrows: false,
  animateParticles: true,
  colorBy: 'type',
  nodeScale: 1.0,
  dimNonNeighbors: true,
  haloGlow: true
};

const DEFAULT_FILTER: FilterConfig = {
  searchQuery: '',
  selectedTags: [],
  selectedTypes: [],
  hideOrphans: false,
  minConnections: 0
};

export const Prj1GraphCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GraphEngine | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const [physicsConfig, setPhysicsConfig] = useState<PhysicsConfig>(DEFAULT_PHYSICS);
  const [displayConfig, setDisplayConfig] = useState<DisplayConfig>(DEFAULT_DISPLAY);
  const [filterConfig, setFilterConfig] = useState<FilterConfig>(DEFAULT_FILTER);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const {
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    connectSourceId,
    setConnectSourceId,
    selectNode,
    selectEdge,
    clearSelection,
    addNode,
    removeNode,
    addEdge,
    nodeCategories,
    appMode
  } = useGraphStore();

  // Convert PipelineGuard entities to GraphNode and GraphEdge with degree-based sizing
  const { graphNodes, graphEdges } = useMemo(() => {
    // Calculate connection count (degree) for each node
    const degreeMap = new Map<string, number>();
    edges.forEach((e) => {
      degreeMap.set(e.sourceNodeId, (degreeMap.get(e.sourceNodeId) || 0) + 1);
      degreeMap.set(e.targetNodeId, (degreeMap.get(e.targetNodeId) || 0) + 1);
    });

    const gNodes: GraphNode[] = nodes.map((n) => {
      const cat = nodeCategories.find((c) => c.id === n.categoryId);
      const rawName = getProperty(n.properties, 'name');
      const name = rawName !== undefined ? String(rawName) : n.id;
      const degree = degreeMap.get(n.id) || 0;
      // Dynamic node size based on number of connections (degree):
      // Base size 18px for isolated nodes, expanding up to 48px for central hub nodes
      const dynamicSize = Math.min(48, Math.max(18, 18 + degree * 5));

      const imageUrl = getProperty(n.properties, 'imageUrl') || (n as any).imageUrl || n.properties?.image;
      const nodeType = imageUrl ? 'image' : 'document';

      return {
        id: n.id,
        label: name,
        type: nodeType,
        tags: [cat?.category || 'General'],
        color: cat?.color || '#06b6d4',
        size: dynamicSize,
        x: n.position?.x,
        y: n.position?.y,
        metadata: {
          customFields: n.properties,
          imageUrl: imageUrl
        }
      };
    });

    const gEdges: GraphEdge[] = edges.map((e) => {
      const label = formatRelationshipLabel(e.relationshipId);
      const color = '#475569';

      return {
        id: e.id,
        source: e.sourceNodeId,
        target: e.targetNodeId,
        label,
        type: 'directional',
        weight: 1.5,
        color
      };
    });

    return { graphNodes: gNodes, graphEdges: gEdges };
  }, [nodes, edges, nodeCategories]);

  // Semantic Connection Picker & Toast State
  const [relationshipPicker, setRelationshipPicker] = useState<{
    sourceNode: Node;
    targetNode: Node;
    options: RelationshipDefinition[];
    selectedId: string;
  } | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<any>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message: msg, type });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 4500);
  }, []);

  const handleAttemptConnect = useCallback(
    async (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return;
      const allNodes = useGraphStore.getState().nodes || nodes;
      const src = allNodes.find((n) => n.id === sourceId);
      const tgt = allNodes.find((n) => n.id === targetId);
      if (!src || !tgt) return;

      const currentEdges = useGraphStore.getState().edges || edges;
      const alreadyConnected = currentEdges.some(
        (e) =>
          (e.sourceNodeId === sourceId && e.targetNodeId === targetId) ||
          (e.sourceNodeId === targetId && e.targetNodeId === sourceId)
      );
      if (alreadyConnected) {
        showToast('Nodes are already connected.', 'error');
        setConnectSourceId(null);
        return;
      }

      try {
        const [forwardRes, reverseRes] = await Promise.all([
          validateRelationship(src.categoryId, tgt.categoryId),
          validateRelationship(tgt.categoryId, src.categoryId)
        ]);

        let relId = '';
        let actualSourceId = sourceId;
        let actualTargetId = targetId;

        if (forwardRes.valid && forwardRes.allowedRelationshipIds.length > 0) {
          relId = forwardRes.allowedRelationshipIds[0];
          actualSourceId = sourceId;
          actualTargetId = targetId;
        } else if (reverseRes.valid && reverseRes.allowedRelationshipIds.length > 0) {
          relId = reverseRes.allowedRelationshipIds[0];
          actualSourceId = targetId;
          actualTargetId = sourceId;
        } else {
          const srcCat = nodeCategories.find((c) => c.id === src.categoryId)?.label || src.categoryId;
          const tgtCat = nodeCategories.find((c) => c.id === tgt.categoryId)?.label || tgt.categoryId;
          showToast(`Invalid Connection: ${srcCat} cannot connect to ${tgtCat}.`, 'error');
          setConnectSourceId(null);
          return;
        }

        await callbacksRef.current.addEdge({
          sourceNodeId: actualSourceId,
          targetNodeId: actualTargetId,
          relationshipId: relId
        });
        showToast(`Connected: ${formatRelationshipLabel(relId)}`, 'success');
        setConnectSourceId(null);
        if (workerRef.current) {
          workerRef.current.postMessage({ type: 'reheat' });
        }
      } catch (err: any) {
        showToast(err.message || 'Failed to validate connection.', 'error');
        setConnectSourceId(null);
      }
    },
    [nodes, edges, nodeCategories, showToast, setConnectSourceId]
  );

  const handleAttemptConnectRef = useRef(handleAttemptConnect);
  useEffect(() => {
    handleAttemptConnectRef.current = handleAttemptConnect;
  }, [handleAttemptConnect]);

  const handleCandidateHover = useCallback(
    (sourceId: string, candidateTargetId: string | null) => {
      if (!candidateTargetId) {
        if (engineRef.current) {
          engineRef.current.setCandidateValidation(null);
        }
        return;
      }

      // Always resolve latest nodes and edges from store to prevent stale closure misses
      const storeNodes = useGraphStore.getState().nodes;
      const allNodes = storeNodes && storeNodes.length > 0 ? storeNodes : nodes;
      const src = allNodes.find((n) => n.id === sourceId);
      const tgt = allNodes.find((n) => n.id === candidateTargetId);
      if (!src || !tgt) {
        console.warn(`[Validate Hover] Candidate node lookup failed: sourceId=${sourceId}, candidateTargetId=${candidateTargetId}`);
        if (engineRef.current) {
          engineRef.current.setCandidateValidation({
            status: 'invalid',
            targetId: candidateTargetId,
            errorMessage: '✕ Invalid Connection'
          });
        }
        return;
      }

      // Check if already connected
      const currentEdges = useGraphStore.getState().edges || edges;
      const alreadyConnected = currentEdges.some(
        (e) =>
          (e.sourceNodeId === sourceId && e.targetNodeId === candidateTargetId) ||
          (e.sourceNodeId === candidateTargetId && e.targetNodeId === sourceId)
      );
      if (alreadyConnected) {
        if (engineRef.current) {
          engineRef.current.setCandidateValidation({
            status: 'invalid',
            targetId: candidateTargetId,
            errorMessage: '✕ Already Connected'
          });
        }
        return;
      }

      // Immediately set candidate validation to validating status on hover
      if (engineRef.current) {
        engineRef.current.setCandidateValidation({
          status: 'validating',
          targetId: candidateTargetId
        });
      }

      // Dynamically validate relationship bidirectionally on hover via backend API contract
      Promise.all([
        validateRelationship(src.categoryId, tgt.categoryId),
        validateRelationship(tgt.categoryId, src.categoryId)
      ])
        .then(([forwardRes, reverseRes]) => {
          if (!engineRef.current) return;
          if (engineRef.current.getConnectingCandidateId() !== candidateTargetId) return;

          const isForwardValid = Boolean(forwardRes.valid && forwardRes.allowedRelationshipIds && forwardRes.allowedRelationshipIds.length > 0);
          const isReverseValid = Boolean(reverseRes.valid && reverseRes.allowedRelationshipIds && reverseRes.allowedRelationshipIds.length > 0);

          if (isForwardValid) {
            engineRef.current.setCandidateValidation({
              status: 'valid',
              targetId: candidateTargetId,
              allowedCount: forwardRes.allowedRelationshipIds ? forwardRes.allowedRelationshipIds.length : 0,
              label: forwardRes.allowedRelationshipIds?.[0] ? formatRelationshipLabel(forwardRes.allowedRelationshipIds[0]) : undefined,
              direction: 'forward'
            });
          } else if (isReverseValid) {
            engineRef.current.setCandidateValidation({
              status: 'valid',
              targetId: candidateTargetId,
              allowedCount: reverseRes.allowedRelationshipIds ? reverseRes.allowedRelationshipIds.length : 0,
              label: reverseRes.allowedRelationshipIds?.[0] ? formatRelationshipLabel(reverseRes.allowedRelationshipIds[0]) : undefined,
              direction: 'reverse'
            });
          } else {
            engineRef.current.setCandidateValidation({
              status: 'invalid',
              targetId: candidateTargetId,
              errorMessage: '✕ Invalid Connection'
            });
          }
        })
        .catch((err) => {
          console.error(`[Validate Hover] API error:`, err);
          if (engineRef.current) {
            engineRef.current.setCandidateValidation({
              status: 'invalid',
              targetId: candidateTargetId,
              errorMessage: '✕ Invalid Connection'
            });
          }
        });
    },
    [nodes, edges]
  );

  const handleCandidateHoverRef = useRef(handleCandidateHover);
  useEffect(() => {
    handleCandidateHoverRef.current = handleCandidateHover;
    if (engineRef.current) {
      engineRef.current.setOnCandidateHover((srcId, tgtId) => {
        handleCandidateHoverRef.current(srcId, tgtId);
      });
    }
  }, [handleCandidateHover]);

  // Keep latest callbacks in ref to avoid re-initializing engine
  const callbacksRef = useRef({
    selectNode,
    selectEdge,
    clearSelection,
    addEdge,
    removeNode,
    connectSourceId,
    selectedNodeId,
    setConnectSourceId
  });

  useEffect(() => {
    callbacksRef.current = {
      selectNode,
      selectEdge,
      clearSelection,
      addEdge,
      removeNode,
      connectSourceId,
      selectedNodeId,
      setConnectSourceId
    };
  });

  // Initialize Web Worker and GraphEngine on mount
  useEffect(() => {
    if (!canvasRef.current) return;

    const worker = new Worker(new URL('../engine/physicsWorker.ts', import.meta.url), {
      type: 'module'
    });
    workerRef.current = worker;

    const engine = new GraphEngine(canvasRef.current, {
      onSelectNode: (id) => {
        if (id) {
          callbacksRef.current.selectNode(id);
        } else {
          callbacksRef.current.selectNode(null);
          callbacksRef.current.setConnectSourceId(null);
        }
      },
      onSelectEdge: (id) => {
        callbacksRef.current.selectEdge(id);
      },
      onHoverNode: (id) => {
        setHoveredNodeId(id);
      },
      onConnectNodes: (sourceId, targetId) => {
        handleAttemptConnectRef.current(sourceId, targetId);
      },
      onCandidateHover: (sourceId, targetId) => {
        handleCandidateHoverRef.current(sourceId, targetId);
      },
      onConnectCancel: () => {
        callbacksRef.current.setConnectSourceId(null);
      },
      onConnectStart: (sourceId) => {
        callbacksRef.current.setConnectSourceId(sourceId);
      }
    });

    engine.initWorker(worker);
    engineRef.current = engine;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        engine.resize(width, height);
      }
    });

    if (canvasRef.current.parentElement) {
      resizeObserver.observe(canvasRef.current.parentElement);
    }

    engine.startRenderLoop();

    return () => {
      engine.stopRenderLoop();
      worker.terminate();
      resizeObserver.disconnect();
    };
  }, []);

  // Synchronize Graph Data & Web Worker Physics
  useEffect(() => {
    if (!engineRef.current || !workerRef.current) return;

    workerRef.current.postMessage({
      type: 'init',
      nodes: graphNodes,
      edges: graphEdges,
      config: physicsConfig
    });

    engineRef.current.updateData(graphNodes, graphEdges);
  }, [graphNodes, graphEdges, physicsConfig]);

  // Synchronize Physics Config
  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'updateConfig',
        config: physicsConfig
      });
    }
  }, [physicsConfig]);

  // Synchronize Connect Mode to Engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setConnectingSource(connectSourceId);
    }
  }, [connectSourceId]);

  // Synchronize App Mode to Engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setAppMode(appMode);
    }
  }, [appMode]);

  // Synchronize Display and Search Configs
  useEffect(() => {
    if (!engineRef.current) return;

    const searchIndexer = createSearchIndexer(graphNodes);
    const searchResults = searchIndexer.search(filterConfig.searchQuery);

    engineRef.current.updateConfigs(
      displayConfig,
      filterConfig,
      searchResults,
      selectedNodeId,
      hoveredNodeId,
      selectedEdgeId
    );
  }, [graphNodes, displayConfig, filterConfig, selectedNodeId, hoveredNodeId, selectedEdgeId]);

  // Drag & Drop from left minimal sidebar
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (appMode === 'attack') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, [appMode]);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      if (appMode === 'attack') return;
      const categoryId = e.dataTransfer.getData('application/pipelineguard-node');
      if (!categoryId) return;

      const canvas = canvasRef.current;
      const engine = engineRef.current;
      if (!canvas || !engine) return;

      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldPos = engine.screenToWorld(screenX, screenY);

      const category = nodeCategories.find((c) => c.id === categoryId);
      const properties = category ? createDefaultProperties(category) : {};

      const createdNode = await addNode({
        categoryId,
        properties,
        position: worldPos
      });

      selectNode(createdNode.id);

      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'reheat' });
      }
    },
    [nodeCategories, addNode, selectNode, appMode]
  );

  const handleReheat = () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'reheat' });
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative w-full h-full bg-[#090d16] overflow-hidden select-none"
    >
      {/* 60 FPS HTML5 Canvas Graph Engine */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-grab active:cursor-grabbing"
      />

      {/* Attack mode subtle badge */}
      {appMode === 'attack' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#12080F]/90 border border-rose-500/30 backdrop-blur-md text-rose-300 text-[11px] shadow-lg pointer-events-none">
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span className="font-medium tracking-tight">Attack Mode Active</span>
        </div>
      )}

      {/* Connect mode banner */}
      {appMode === 'edit' && connectSourceId && (() => {
        const srcNode = nodes.find((n) => n.id === connectSourceId);
        const srcName = srcNode ? getProperty(srcNode.properties, 'name') || srcNode.id : 'Node';
        return (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-full bg-[#0B1220]/95 border border-cyan-500/40 backdrop-blur-md text-cyan-200 text-xs shadow-2xl animate-fade-in">
            <Link2 className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>
              Linking from <strong className="text-white font-semibold">{srcName}</strong>: Click (left or right) on target node to connect (Click empty space or ESC to cancel)
            </span>
            <button
              onClick={() => setConnectSourceId(null)}
              className="ml-2 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px] text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        );
      })()}

      {/* Floating Color : Category Table Reference */}
      {isLegendOpen && (
        <div className="absolute bottom-16 left-5 z-20 w-80 p-3.5 rounded-2xl bg-[#0F172A]/95 backdrop-blur-xl border border-white/15 shadow-2xl space-y-2 animate-fade-in text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2 font-semibold text-slate-200">
              <Palette className="w-4 h-4 text-cyan-400" />
              <span>Color : Category Reference</span>
            </div>
            <button
              onClick={() => setIsLegendOpen(false)}
              className="p-1 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Close Reference"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1 custom-scrollbar pr-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] text-slate-500 uppercase tracking-wider border-b border-white/5">
                  <th className="pb-1 font-medium w-8">Color</th>
                  <th className="pb-1 font-medium">Category</th>
                  <th className="pb-1 font-medium text-right">Nodes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {nodeCategories.map((cat) => {
                  const count = nodes.filter((n) => n.categoryId === cat.id).length;
                  return (
                    <tr
                      key={cat.id}
                      onClick={() => {
                        const firstNode = nodes.find((n) => n.categoryId === cat.id);
                        if (firstNode) {
                          callbacksRef.current.selectNode(firstNode.id);
                          engineRef.current?.centerOnNode(firstNode.id);
                        }
                      }}
                      className="hover:bg-white/5 cursor-pointer rounded transition-colors group"
                      title={`Click to focus ${cat.category} nodes`}
                    >
                      <td className="py-1.5 pr-2">
                        <span
                          className="w-3.5 h-3.5 rounded-full inline-block shrink-0 shadow-sm transition-transform group-hover:scale-125"
                          style={{
                            backgroundColor: cat.color || '#06b6d4',
                            boxShadow: `0 0 8px ${cat.color || '#06b6d4'}80`
                          }}
                        />
                      </td>
                      <td className="py-1.5 text-slate-300 group-hover:text-cyan-300 truncate max-w-[140px] font-medium">
                        {cat.category}
                      </td>
                      <td className="py-1.5 text-right font-mono text-[10px]">
                        <span className={`px-1.5 py-0.5 rounded-full ${count > 0 ? 'bg-white/10 text-slate-200 font-semibold' : 'text-slate-600'}`}>
                          {count}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Floating Obsidian Graph Controls HUD */}
      <div className="absolute bottom-5 left-5 z-20 flex items-center gap-1.5 p-1 rounded-xl bg-[#0F172A]/85 backdrop-blur-md border border-white/10 shadow-2xl">
        <button
          onClick={() => engineRef.current?.zoomIn()}
          title="Zoom In (+)"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          onClick={() => engineRef.current?.zoomOut()}
          title="Zoom Out (-)"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-4 bg-white/10 my-auto" />

        <button
          onClick={() => engineRef.current?.centerCamera()}
          title="Center Camera (Double-click background)"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <button
          onClick={handleReheat}
          title="Reheat Physics Simulation"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>


        <div className="w-[1px] h-4 bg-white/10 my-auto" />

        <button
          onClick={() => setIsLegendOpen(!isLegendOpen)}
          title="Toggle Color : Category Table Reference"
          className={`p-1.5 rounded-lg transition-colors flex items-center gap-1.5 px-2 text-xs cursor-pointer ${isLegendOpen
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
            : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
        >
          <Palette className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-medium">Color : Cat</span>
        </button>

        <div className="w-[1px] h-4 bg-white/10 my-auto" />

        <button
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          title="Obsidian Graph Engine Settings"
          className={`p-1.5 rounded-lg transition-colors ${isSettingsOpen
            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
            : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
        >
          <Sliders className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-4 bg-white/10 my-auto" />

        {/* Minimal Graph Statistics */}
        <div className="px-2.5 text-[11px] font-mono text-slate-400">
          <span className="text-slate-200 font-medium">{nodes.length}</span> nodes ·{' '}
          <span className="text-slate-200 font-medium">{edges.length}</span> links
        </div>
      </div>

      {/* Obsidian Graph View Settings Drawer */}
      {isSettingsOpen && (
        <aside className="absolute top-5 left-5 z-30 w-72 p-4 rounded-xl bg-[#0F172A]/90 backdrop-blur-xl border border-white/10 shadow-2xl text-xs space-y-4 animate-fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2 font-medium text-slate-200">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>Graph Engine Settings</span>
            </div>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="p-1 rounded text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search Filter */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={filterConfig.searchQuery}
              onChange={(e) => setFilterConfig({ ...filterConfig, searchQuery: e.target.value })}
              placeholder="Search graph nodes..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-800/80 border border-white/10 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
            />
          </div>

          {/* Forces Section */}
          <div className="space-y-3">
            <div className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Physics Forces</span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Repulsion</span>
                <span className="font-mono">{physicsConfig.repulsion}</span>
              </div>
              <input
                type="range"
                min="-600"
                max="-30"
                step="10"
                value={physicsConfig.repulsion}
                onChange={(e) =>
                  setPhysicsConfig({ ...physicsConfig, repulsion: Number(e.target.value) })
                }
                className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Link Distance</span>
                <span className="font-mono">{physicsConfig.linkDistance}</span>
              </div>
              <input
                type="range"
                min="20"
                max="200"
                step="5"
                value={physicsConfig.linkDistance}
                onChange={(e) =>
                  setPhysicsConfig({ ...physicsConfig, linkDistance: Number(e.target.value) })
                }
                className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Center Gravity</span>
                <span className="font-mono">{physicsConfig.gravity}</span>
              </div>
              <input
                type="range"
                min="0.02"
                max="0.35"
                step="0.01"
                value={physicsConfig.gravity}
                onChange={(e) =>
                  setPhysicsConfig({ ...physicsConfig, gravity: Number(e.target.value) })
                }
                className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Display Options Section */}
          <div className="space-y-2.5 pt-2 border-t border-white/10">
            <div className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>Display & Aesthetics</span>
            </div>

            <label className="flex items-center justify-between cursor-pointer text-slate-300">
              <span>Curved Links</span>
              <input
                type="checkbox"
                checked={displayConfig.curvedEdges}
                onChange={(e) =>
                  setDisplayConfig({ ...displayConfig, curvedEdges: e.target.checked })
                }
                className="accent-indigo-500 rounded"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer text-slate-300">
              <span>Animated Particles</span>
              <input
                type="checkbox"
                checked={displayConfig.animateParticles}
                onChange={(e) =>
                  setDisplayConfig({ ...displayConfig, animateParticles: e.target.checked })
                }
                className="accent-indigo-500 rounded"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer text-slate-300">
              <span>Halo Glow</span>
              <input
                type="checkbox"
                checked={displayConfig.haloGlow}
                onChange={(e) =>
                  setDisplayConfig({ ...displayConfig, haloGlow: e.target.checked })
                }
                className="accent-indigo-500 rounded"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer text-slate-300">
              <span>Dim Non-Neighbors</span>
              <input
                type="checkbox"
                checked={displayConfig.dimNonNeighbors}
                onChange={(e) =>
                  setDisplayConfig({ ...displayConfig, dimNonNeighbors: e.target.checked })
                }
                className="accent-indigo-500 rounded"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer text-slate-300">
              <span>Show Labels</span>
              <input
                type="checkbox"
                checked={displayConfig.showLabels}
                onChange={(e) =>
                  setDisplayConfig({ ...displayConfig, showLabels: e.target.checked })
                }
                className="accent-indigo-500 rounded"
              />
            </label>
          </div>
        </aside>
      )}

      {/* Relationship Selection Modal for multiple valid relationships */}
      {relationshipPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setRelationshipPicker(null)}
        >
          <div
            className="w-full max-w-md bg-[#0F172A] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Choose Relationship</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select semantic connection from{' '}
                  <span className="text-cyan-300 font-medium">
                    {getProperty(relationshipPicker.sourceNode.properties, 'name') || relationshipPicker.sourceNode.id}
                  </span>{' '}
                  to{' '}
                  <span className="text-cyan-300 font-medium">
                    {getProperty(relationshipPicker.targetNode.properties, 'name') || relationshipPicker.targetNode.id}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setRelationshipPicker(null)}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
              {relationshipPicker.options.map((opt) => {
                const isSelected = relationshipPicker.selectedId === opt.id;
                const group = getRelationshipGroupInfo(opt.id);
                return (
                  <div
                    key={opt.id}
                    onClick={() =>
                      setRelationshipPicker({ ...relationshipPicker, selectedId: opt.id })
                    }
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/50 shadow-lg shadow-cyan-500/10'
                        : 'bg-white/[0.02] border-white/5 hover:border-white/20 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: group.color }}
                        />
                        <span className="text-xs font-semibold text-slate-200">{opt.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-white/5 text-slate-400">
                          {group.group}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                      {opt.description}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                onClick={() => setRelationshipPicker(null)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  callbacksRef.current.addEdge({
                    sourceNodeId: relationshipPicker.sourceNode.id,
                    targetNodeId: relationshipPicker.targetNode.id,
                    relationshipId: relationshipPicker.selectedId
                  });
                  setRelationshipPicker(null);
                  if (workerRef.current) {
                    workerRef.current.postMessage({ type: 'reheat' });
                  }
                }}
                className="px-4 py-2 text-xs font-medium text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
              >
                Create Relationship
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-medium shadow-2xl backdrop-blur-md animate-slide-up transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-950/95 border border-emerald-500/50 text-emerald-100 shadow-emerald-950/50'
              : 'bg-rose-950/95 border border-rose-500/50 text-rose-100 shadow-rose-950/50'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className={`ml-2 transition-colors ${
              toast.type === 'success'
                ? 'text-emerald-400 hover:text-emerald-100'
                : 'text-rose-400 hover:text-rose-100'
            }`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
