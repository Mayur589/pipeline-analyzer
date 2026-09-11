import React, { useState, useRef, useEffect } from 'react';
import { useGraphStore } from '../store/graphStore';
import {
  FolderGit2,
  ChevronDown,
  Plus,
  Sparkles,
  Download,
  Trash2,
  Check,
  Radio,
  Loader2
} from 'lucide-react';

import { createDefaultProperties } from '../types/graph';
import { validateRelationship } from '../api/client';

export const Header: React.FC = () => {
  const {
    nodes,
    edges,
    clearCanvas,
    addNode,
    addEdge,
    removeNode,
    removeEdge,
    projectId,
    projects,
    selectProject,
    createNewProject,
    isLoading,
    nodeCategories
  } = useGraphStore();

  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isSubmittingNewProject, setIsSubmittingNewProject] = useState(false);
  const [isPopulatingSample, setIsPopulatingSample] = useState(false);

  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as HTMLElement)) {
        setIsProjectDropdownOpen(false);
        setIsCreatingProject(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeProject = projects.find((p) => p.id === projectId);

  const handleCreateProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setIsSubmittingNewProject(true);
    try {
      await createNewProject(newProjectName.trim());
      setNewProjectName('');
      setIsCreatingProject(false);
      setIsProjectDropdownOpen(false);
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setIsSubmittingNewProject(false);
    }
  };

  const handleExportJson = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify({ projectId, nodes, edges }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `pipelineguard-${projectId || 'graph'}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleClearProject = async () => {
    if (nodes.length === 0 && edges.length === 0) return;
    if (!confirm('Are you sure you want to clear all nodes and edges in this project?')) return;

    // Delete edges first
    const edgeCopy = [...edges];
    for (const e of edgeCopy) {
      await removeEdge(e.id);
    }
    // Delete nodes
    const nodeCopy = [...nodes];
    for (const n of nodeCopy) {
      await removeNode(n.id);
    }
    clearCanvas();
  };

  const handleLoadSamplePipeline = async () => {
    if (isPopulatingSample) return;
    setIsPopulatingSample(true);

    try {
      // Clear existing project items first
      const edgeCopy = [...edges];
      for (const e of edgeCopy) {
        await removeEdge(e.id);
      }
      const nodeCopy = [...nodes];
      for (const n of nodeCopy) {
        await removeNode(n.id);
      }
      clearCanvas();

      // Dynamically generate a node for each category retrieved from backend
      const createdNodes: Record<string, any> = {};
      const positions: Record<string, { x: number; y: number }> = {
        identity_people: { x: 100, y: 220 },
        source_control: { x: 340, y: 140 },
        dependencies: { x: 340, y: 380 },
        secrets_credentials: { x: 580, y: 60 },
        cicd_pipeline: { x: 580, y: 220 },
        build_environment: { x: 820, y: 220 },
        artifact_storage: { x: 1060, y: 220 },
        runtime_environment: { x: 1300, y: 220 },
        monitoring_response: { x: 700, y: 440 }
      };

      for (let i = 0; i < nodeCategories.length; i++) {
        const cat = nodeCategories[i];
        const defaultProps = createDefaultProperties(cat);
        const pos = positions[cat.id] || { x: 150 + (i % 4) * 250, y: 100 + Math.floor(i / 4) * 180 };
        const node = await addNode({
          categoryId: cat.id,
          properties: defaultProps,
          position: pos
        });
        createdNodes[cat.id] = node;
      }

      // Connect candidate pairs strictly validated by the backend
      const candidatePairs: [string, string][] = [
        ['identity_people', 'source_control'],
        ['source_control', 'cicd_pipeline'],
        ['source_control', 'build_environment'],
        ['secrets_credentials', 'cicd_pipeline'],
        ['cicd_pipeline', 'build_environment'],
        ['dependencies', 'build_environment'],
        ['build_environment', 'artifact_storage'],
        ['artifact_storage', 'runtime_environment'],
        ['runtime_environment', 'monitoring_response'],
        ['monitoring_response', 'identity_people']
      ];

      for (const [srcCat, tgtCat] of candidatePairs) {
        const srcNode = createdNodes[srcCat];
        const tgtNode = createdNodes[tgtCat];
        if (srcNode && tgtNode) {
          const val = await validateRelationship(srcCat, tgtCat);
          if (val.valid && val.allowedRelationshipIds.length > 0) {
            await addEdge({
              sourceNodeId: srcNode.id,
              targetNodeId: tgtNode.id,
              relationshipId: val.allowedRelationshipIds[0]
            });
          }
        }
      }
    } catch (e) {
      console.error('Failed to load sample pipeline:', e);
    } finally {
      setIsPopulatingSample(false);
    }
  };

  return (
    <header className="h-14 bg-[#0B1220]/90 backdrop-blur-md border-b border-white/5 px-5 flex items-center justify-between z-30 select-none">
      {/* Left: Branding & Project Selector */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Radio className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
              PipelineGuard
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                Live
              </span>
            </h1>
          </div>
        </div>

        <div className="h-4 w-px bg-white/10" />

        {/* Project Selector Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 transition-all text-xs text-slate-200 cursor-pointer"
            title="Switch or create project"
          >
            <FolderGit2 className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-medium max-w-[150px] truncate">
              {activeProject ? activeProject.name : 'Select Project'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
          </button>

          {/* Dropdown Menu */}
          {isProjectDropdownOpen && (
            <div className="absolute left-0 mt-2 w-64 rounded-xl bg-[#0F172A] border border-white/10 shadow-2xl shadow-black/60 p-2 z-50 text-xs">
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-white/5">
                Backend Projects ({projects.length})
              </div>

              <div className="max-h-48 overflow-y-auto py-1 space-y-0.5 custom-scrollbar">
                {projects.map((p) => {
                  const isSelected = p.id === projectId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        selectProject(p.id);
                        setIsProjectDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-500/15 text-cyan-300 font-medium'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span className="truncate">{p.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* Create New Project Section */}
              <div className="pt-2 border-t border-white/5 mt-1">
                {isCreatingProject ? (
                  <form onSubmit={handleCreateProjectSubmit} className="space-y-2 p-1">
                    <input
                      type="text"
                      placeholder="Project Name..."
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      autoFocus
                      disabled={isSubmittingNewProject}
                      className="w-full px-2.5 py-1.5 rounded bg-black/30 border border-white/15 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        type="button"
                        onClick={() => setIsCreatingProject(false)}
                        className="px-2 py-1 text-[11px] text-slate-400 hover:text-white rounded hover:bg-white/5"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingNewProject || !newProjectName.trim()}
                        className="px-2.5 py-1 text-[11px] font-medium bg-cyan-500 hover:bg-cyan-400 text-black rounded disabled:opacity-50 transition-colors flex items-center gap-1"
                      >
                        {isSubmittingNewProject ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          'Create'
                        )}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => setIsCreatingProject(true)}
                    className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Project...</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Backend Connected Pill */}
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>127.0.0.1:3000</span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {isLoading && (
          <div className="flex items-center gap-1.5 text-xs text-cyan-400 font-mono pr-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="hidden sm:inline">Syncing...</span>
          </div>
        )}

        <button
          onClick={handleLoadSamplePipeline}
          disabled={isPopulatingSample || !projectId}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 hover:border-cyan-500/30 rounded-lg transition-all cursor-pointer disabled:opacity-50"
          title="Populate complete supply chain sample into backend"
        >
          {isPopulatingSample ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          <span>Load Sample</span>
        </button>

        <button
          onClick={handleClearProject}
          disabled={nodes.length === 0}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
          title="Clear all nodes in current project"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Clear</span>
        </button>

        <button
          onClick={handleExportJson}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-normal text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-lg transition-colors cursor-pointer"
          title="Export graph as JSON"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};
