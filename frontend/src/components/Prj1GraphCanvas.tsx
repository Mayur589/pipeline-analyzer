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
  formatRelationshipLabel,
  getRelationshipColor
} from '../types/graph';
import type { RelationshipDefinition } from '../types/graph';
import { validateRelationship } from '../api/client';
import {
  Link2,
  X,
  AlertTriangle,
  Check,
  CheckCircle2,
  ShieldAlert,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Compass,
  Navigation,
  Layers
} from 'lucide-react';

const DEFAULT_PHYSICS: PhysicsConfig = {
  repulsion: -420,
  linkDistance: 190,
  linkStrength: 0.65,
  gravity: 0.035,
  collisionRadius: 55,
  damping: 0.38,
  enabled: true,
  unconnectedRepulsion: -280,
  unconnectedGravity: 0.04
};

const DEFAULT_DISPLAY: DisplayConfig = {
  showLabels: true,
  labelSize: 11.5,
  linkThickness: 1.8,
  curvedEdges: false,
  showArrows: true,
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

  const [physicsConfig] = useState<PhysicsConfig>(DEFAULT_PHYSICS);
  const [displayConfig, setDisplayConfig] = useState<DisplayConfig>(DEFAULT_DISPLAY);
  const [filterConfig] = useState<FilterConfig>(DEFAULT_FILTER);
  const [hoveredNodeInfo, setHoveredNodeInfo] = useState<{ id: string; x: number; y: number } | null>(null);
  const hoveredNodeId = hoveredNodeInfo?.id || null;

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
    appMode,
    attackResult,
    attackError,
    focusNodeRequest,
    clearAttackSimulation
  } = useGraphStore();

  const [hoveredEdgeInfo, setHoveredEdgeInfo] = useState<{ id: string; x: number; y: number } | null>(null);

  // Convert Pipeline Analyzer entities to GraphNode and GraphEdge with degree-based sizing
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
      // Obsidian graph aesthetic: Small, elegant dots (4.5px base up to 10px for hub nodes)
      const dynamicSize = Math.min(10, Math.max(4.5, 4.5 + degree * 0.8));

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
      const relColor = getRelationshipColor(e.relationshipId);

      return {
        id: e.id,
        source: e.sourceNodeId,
        target: e.targetNodeId,
        label,
        type: 'directional',
        weight: 1.8,
        color: '#64748b',
        relationshipColor: relColor
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
        callbacksRef.current.selectNode(id);
      },
      onSelectEdge: (id) => {
        callbacksRef.current.selectEdge(id);
      },
      onHoverNode: (id, clientX, clientY) => {
        setHoveredNodeInfo(id ? { id, x: clientX ?? 0, y: clientY ?? 0 } : null);
      },
      onHoverEdge: (id, clientX, clientY) => {
        setHoveredEdgeInfo(id ? { id, x: clientX ?? 0, y: clientY ?? 0 } : null);
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

  // Synchronize App Mode & Attack Simulation to Engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setAppMode(appMode);
      engineRef.current.setAttackSimulation(appMode === 'attack' ? attackResult : null);
    }
  }, [appMode, attackResult]);

  useEffect(() => {
    const request = focusNodeRequest;
    const canvas = canvasRef.current;
    if (!request || appMode !== 'attack' || !canvas || !nodes.some((node) => node.id === request.nodeId)) return;

    engineRef.current?.centerOnNode(request.nodeId);
    const bounds = canvas.getBoundingClientRect();
    setHoveredNodeInfo({
      id: request.nodeId,
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2
    });
  }, [focusNodeRequest, appMode, nodes]);

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

      {/* Floating Hover Tooltip for Nodes */}
      {hoveredNodeInfo && (() => {
        const node = nodes.find((n) => n.id === hoveredNodeInfo.id);
        if (!node) return null;
        const category = nodeCategories.find((c) => c.id === node.categoryId);
        const nodeName = getProperty(node.properties, 'name') || node.id;
        const nodeDegree = edges.filter((e) => e.sourceNodeId === node.id || e.targetNodeId === node.id).length;

        // Attack simulation context
        const isStartNode = attackResult?.startNodeId === node.id;
        const stepIndex = attackResult?.steps.findIndex((s) => s.targetNodeId === node.id) ?? -1;
        const reachedStep = stepIndex >= 0 && attackResult ? attackResult.steps[stepIndex] : null;

        // Custom properties entries (excluding name & image which are already shown)
        const customProps = Object.entries(node.properties || {}).filter(
          ([k, v]) => k !== 'name' && k !== 'image' && k !== 'imageUrl' && v !== undefined && v !== ''
        );

        return (
          <div
            style={{
              left: Math.min(hoveredNodeInfo.x + 16, typeof window !== 'undefined' ? window.innerWidth - 320 : hoveredNodeInfo.x + 16),
              top: Math.min(hoveredNodeInfo.y - 12, typeof window !== 'undefined' ? window.innerHeight - 300 : hoveredNodeInfo.y - 12)
            }}
            className="fixed pointer-events-none z-50 p-3.5 rounded-xl bg-[#0B111E]/95 border border-white/20 backdrop-blur-xl shadow-2xl text-xs space-y-2 min-w-[240px] max-w-sm animate-fade-in text-slate-200"
          >
            {/* Header: Category & Connections */}
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
              <div className="flex items-center gap-1.5 font-medium">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: category?.color || '#06b6d4' }}
                />
                <span className="text-slate-300 font-semibold">{category?.category || 'Node'}</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">
                {nodeDegree} {nodeDegree === 1 ? 'connection' : 'connections'}
              </span>
            </div>

            {/* Node Title */}
            <div>
              <div className="text-white font-bold text-sm tracking-tight">{nodeName}</div>
              {node.id !== nodeName && (
                <div className="text-[10px] font-mono text-slate-500 truncate">{node.id}</div>
              )}
            </div>

            {/* Attack Simulation Breach Details */}
            {attackResult && (
              <div className="pt-1 border-t border-white/10 space-y-1.5">
                {isStartNode ? (
                  <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 space-y-1">
                    <div className="flex items-center gap-1.5 text-rose-300 font-bold text-xs">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                      <span>Attack Origin (Patient Zero)</span>
                    </div>
                    <div className="text-[11px] text-rose-200/80">
                      Adversary entry point and simulation epicenter.
                    </div>
                  </div>
                ) : reachedStep ? (
                  <div className={`p-2 rounded-lg border space-y-1.5 ${
                    reachedStep.outcome === 'COMPROMISED'
                      ? 'bg-rose-500/15 border-rose-500/30 text-rose-200'
                      : reachedStep.outcome === 'BLOCKED'
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
                      : reachedStep.outcome === 'SLOWED'
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-200'
                      : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-200'
                  }`}>
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-mono text-[10px] text-slate-300">
                        Step {stepIndex + 1} of {attackResult.steps.length}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        reachedStep.outcome === 'COMPROMISED' ? 'bg-rose-500/25 text-rose-300' :
                        reachedStep.outcome === 'BLOCKED' ? 'bg-emerald-500/25 text-emerald-300' :
                        reachedStep.outcome === 'SLOWED' ? 'bg-amber-500/25 text-amber-300' :
                        'bg-cyan-500/25 text-cyan-300'
                      }`}>
                        {reachedStep.outcome}
                      </span>
                    </div>

                    <div className="text-[11px] leading-relaxed text-slate-200">
                      {reachedStep.reason}
                    </div>

                    {reachedStep.controlsTriggered.length > 0 && (
                      <div className="flex items-center gap-1 pt-1 flex-wrap">
                        <span className="text-[10px] text-slate-400">Controls:</span>
                        {reachedStep.controlsTriggered.map((ctrl, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded bg-white/10 text-cyan-200 font-mono text-[10px]">
                            {ctrl}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                    <span>Unreached / Protected from breach traversal</span>
                  </div>
                )}
              </div>
            )}

            {/* Custom Properties (if available) */}
            {customProps.length > 0 && (
              <div className="pt-1.5 border-t border-white/10 space-y-1">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Properties</div>
                <div className="space-y-0.5 max-h-24 overflow-y-auto custom-scrollbar pr-1">
                  {customProps.slice(0, 5).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 capitalize">{key}:</span>
                      <span className="text-slate-200 font-medium truncate max-w-[140px]">
                        {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Floating Hover Tooltip for Simulated Edges */}
      {hoveredEdgeInfo && attackResult && (() => {
        const step = attackResult.steps.find((s) => s.edgeId === hoveredEdgeInfo.id);
        if (!step) return null;
        return (
          <div
            style={{ left: hoveredEdgeInfo.x + 12, top: hoveredEdgeInfo.y - 12 }}
            className="fixed pointer-events-none z-50 p-2.5 rounded-xl bg-[#090D16]/95 border border-white/20 backdrop-blur-xl shadow-2xl text-xs space-y-1 min-w-[200px] max-w-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-200">{formatRelationshipLabel(step.relationship)}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                step.outcome === 'COMPROMISED' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                step.outcome === 'SLOWED' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                step.outcome === 'BLOCKED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              }`}>
                {step.outcome}
              </span>
            </div>
            <div className="text-[11px] text-slate-300">{step.reason}</div>
            {step.controlsTriggered.length > 0 && (
              <div className="text-[10px] text-slate-400">
                Mitigating: {step.controlsTriggered.join(', ')}
              </div>
            )}
          </div>
        );
      })()}

      {/* Simulation Error Toast */}
      {attackError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-950/95 border border-rose-500/40 text-rose-200 text-xs shadow-2xl animate-fade-in">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{attackError}</span>
          <button
            onClick={clearAttackSimulation}
            className="ml-2 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            Dismiss
          </button>
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
      {/* Floating Canvas Quick Controls */}
      <div className="absolute bottom-5 left-5 z-20 flex items-center gap-1 p-1 rounded-xl bg-[#0F172A]/90 backdrop-blur-md border border-white/10 shadow-xl text-slate-300">
        <button
          type="button"
          onClick={() => engineRef.current?.zoomIn()}
          className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          title="Zoom In (+)"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => engineRef.current?.zoomOut()}
          className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          title="Zoom Out (-)"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => engineRef.current?.zoomToFit()}
          className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          title="Zoom to Fit all nodes"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => engineRef.current?.centerCamera()}
          className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          title="Reset Camera Center"
        >
          <Compass className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (workerRef.current) {
              workerRef.current.postMessage({ type: 'reheat' });
            }
          }}
          className="p-1.5 rounded-lg hover:bg-white/10 hover:text-cyan-400 transition-colors cursor-pointer"
          title="Reheat & Relax Layout"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-white/10 mx-0.5" />

        <button
          type="button"
          onClick={() => {
            setDisplayConfig(prev => ({ ...prev, showArrows: !prev.showArrows }));
          }}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            displayConfig.showArrows ? 'text-cyan-400 bg-cyan-500/15' : 'hover:bg-white/10 hover:text-white'
          }`}
          title={displayConfig.showArrows ? 'Hide Arrowheads' : 'Show Arrowheads'}
        >
          <Navigation className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => {
            setDisplayConfig(prev => ({ ...prev, curvedEdges: !prev.curvedEdges }));
          }}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            displayConfig.curvedEdges ? 'text-cyan-400 bg-cyan-500/15' : 'hover:bg-white/10 hover:text-white'
          }`}
          title={displayConfig.curvedEdges ? 'Curved Lines: ON' : 'Straight Lines: ON'}
        >
          <Layers className="w-3.5 h-3.5" />
        </button>

      </div>
    </div>
  );
};
