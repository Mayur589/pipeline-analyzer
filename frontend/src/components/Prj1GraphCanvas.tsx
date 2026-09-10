import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useGraphStore } from '../store/graphStore';
import { GraphEngine } from '../engine/GraphEngine';
import { createSearchIndexer } from '../engine/search';
import type {
  GraphNode,
  GraphEdge,
  PhysicsConfig,
  DisplayConfig,
  FilterConfig
} from '../types/graph';
import { getProperty, createDefaultProperties } from '../types/graph';
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
  Search
} from 'lucide-react';

const DEFAULT_PHYSICS: PhysicsConfig = {
  repulsion: -320,
  linkDistance: 120,
  linkStrength: 0.5,
  gravity: 0.06,
  collisionRadius: 30,
  damping: 0.4,
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
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);

  const {
    nodes,
    edges,
    selectedNodeId,
    selectNode,
    selectEdge,
    clearSelection,
    addNode,
    addEdge,
    nodeCategories
  } = useGraphStore();

  // Convert PipelineGuard entities to GraphNode and GraphEdge
  const { graphNodes, graphEdges } = useMemo(() => {
    const gNodes: GraphNode[] = nodes.map((n) => {
      const cat = nodeCategories.find((c) => c.id === n.categoryId);
      const name = getProperty(n.properties, 'name') || n.id;
      return {
        id: n.id,
        label: name,
        type: 'document',
        tags: [cat?.category || 'General'],
        color: cat?.color || '#06b6d4',
        size: Math.max(16, Math.min(26, 12 + name.length * 0.4)),
        x: n.position?.x,
        y: n.position?.y,
        metadata: {
          customFields: n.properties
        }
      };
    });

    const gEdges: GraphEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      label: e.relationship,
      type: 'default',
      color: 'rgba(148, 163, 184, 0.4)'
    }));

    return { graphNodes: gNodes, graphEdges: gEdges };
  }, [nodes, edges, nodeCategories]);

  // Keep latest callbacks in ref to avoid re-initializing engine
  const callbacksRef = useRef({
    selectNode,
    selectEdge,
    clearSelection,
    addEdge,
    connectSourceId,
    selectedNodeId
  });

  useEffect(() => {
    callbacksRef.current = {
      selectNode,
      selectEdge,
      clearSelection,
      addEdge,
      connectSourceId,
      selectedNodeId
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
      onSelectNode: (id, e) => {
        const {
          selectNode: sNode,
          clearSelection: cSelection,
          addEdge: aEdge,
          connectSourceId: cId,
          selectedNodeId: sId
        } = callbacksRef.current;

        if (id) {
          // Shift + click connection flow
          if ((e?.shiftKey || cId) && (cId || sId)) {
            const src = cId || sId;
            if (src && src !== id) {
              aEdge({
                sourceNodeId: src,
                targetNodeId: id,
                relationship: 'relates to'
              });
              setConnectSourceId(null);
              return;
            }
          }
          setConnectSourceId(null);
          sNode(id);
        } else {
          setConnectSourceId(null);
          cSelection();
        }
      },
      onSelectEdge: (id) => {
        setConnectSourceId(null);
        callbacksRef.current.selectEdge(id);
      },
      onHoverNode: (id) => setHoveredNodeId(id)
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
      hoveredNodeId
    );
  }, [graphNodes, displayConfig, filterConfig, selectedNodeId, hoveredNodeId]);

  // Drag & Drop from left minimal sidebar
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
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
    [nodeCategories, addNode, selectNode]
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

      {/* Connect mode banner */}
      {connectSourceId && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 backdrop-blur-md text-cyan-200 text-xs shadow-lg animate-fade-in">
          <Link2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
          <span>Click any node to create relationship</span>
          <button
            onClick={() => setConnectSourceId(null)}
            className="ml-2 hover:text-white underline text-[11px]"
          >
            Cancel
          </button>
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

        {selectedNodeId && (
          <>
            <div className="w-[1px] h-4 bg-white/10 my-auto" />
            <button
              onClick={() => setConnectSourceId(selectedNodeId)}
              title="Connect to another node (or Shift+Click target)"
              className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs px-2 ${
                connectSourceId
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Connect</span>
            </button>
          </>
        )}

        <div className="w-[1px] h-4 bg-white/10 my-auto" />

        <button
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          title="Obsidian Graph Engine Settings"
          className={`p-1.5 rounded-lg transition-colors ${
            isSettingsOpen
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
                min="-1000"
                max="-50"
                step="25"
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
                min="30"
                max="300"
                step="10"
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
                min="0.01"
                max="0.3"
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
    </div>
  );
};
