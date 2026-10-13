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
  Loader2,
  Pencil,
  X,
  Edit3,
  ShieldAlert
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
    updateProject,
    deleteProject,
    isLoading,
    nodeCategories,
    appMode,
    setAppMode,
    setSelectedScenario
  } = useGraphStore();

  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isSubmittingNewProject, setIsSubmittingNewProject] = useState(false);
  const [isPopulatingSample, setIsPopulatingSample] = useState(false);

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [isSubmittingEditProject, setIsSubmittingEditProject] = useState(false);
  const [confirmDeleteProjectId, setConfirmDeleteProjectId] = useState<string | null>(null);
  const [isSubmittingDeleteProject, setIsSubmittingDeleteProject] = useState(false);

  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as HTMLElement)) {
        setIsProjectDropdownOpen(false);
        setIsCreatingProject(false);
        setEditingProjectId(null);
        setConfirmDeleteProjectId(null);
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

  const handleStartEditProject = (p: { id: string; name: string }, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteProjectId(null);
    setEditingProjectId(p.id);
    setEditingProjectName(p.name);
  };

  const handleEditProjectSubmit = async (targetProjectId: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingProjectName.trim()) return;

    setIsSubmittingEditProject(true);
    try {
      await updateProject(targetProjectId, editingProjectName.trim());
      setEditingProjectId(null);
    } catch (err) {
      console.error('Failed to update project:', err);
    } finally {
      setIsSubmittingEditProject(false);
    }
  };

  const handleDeleteProject = async (targetProjectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSubmittingDeleteProject(true);
    try {
      await deleteProject(targetProjectId);
      setConfirmDeleteProjectId(null);
    } catch (err) {
      console.error('Failed to delete project:', err);
    } finally {
      setIsSubmittingDeleteProject(false);
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
      // Give the example its own named project, preserving the active graph.
      await createNewProject('ChainDrop npm Worm (example)');
      clearCanvas();
      setSelectedScenario('ChainDrop');

      const nodeSpecs = [
        { key: 'maintainer', categoryId: 'identity_people', name: 'Package Maintainer', values: { mfaEnabled: false } },
        { key: 'dev', categoryId: 'identity_people', name: 'Developer Workstation', values: { mfaEnabled: true } },
        { key: 'deps', categoryId: 'dependencies', name: 'npm: cache-utils', values: { lifecycleScripts: 'Enabled', releaseCooldown: 'None', lockfilePinned: false, vulnerabilityScanning: true } },
        { key: 'deps2', categoryId: 'dependencies', name: 'npm: downstream-app', values: { lifecycleScripts: 'Enabled', releaseCooldown: 'None', lockfilePinned: false, vulnerabilityScanning: true } },
        { key: 'repo', categoryId: 'source_control', name: 'app-repo', values: { branchProtection: true } },
        { key: 'build', categoryId: 'build_environment', name: 'Shared CI Runner', values: { isolationLevel: 'Shared Node' } },
        { key: 'ci', categoryId: 'cicd_pipeline', name: 'Release Workflow', values: { trustedPublishing: true, approvalRequired: false } },
        { key: 'token', categoryId: 'secrets_credentials', name: 'npm Publish Token', values: { tokenScope: 'Publish + 2FA Bypass', autoRevoke: false, vaultType: 'HashiCorp Vault' } },
        { key: 'registry', categoryId: 'artifact_storage', name: 'Internal Registry', values: { signatureVerification: true, immutableTags: true } },
        { key: 'dist', categoryId: 'distribution', name: 'CDN', values: { integrityCheck: true } },
        { key: 'prod', categoryId: 'runtime_environment', name: 'Production Cluster', values: { enforceZeroTrust: false } },
        { key: 'siem', categoryId: 'monitoring_response', name: 'SIEM', values: { alertThreshold: 'Strict Policy Violations' } }
      ] as const;
      const positions: Record<string, { x: number; y: number }> = {
        maintainer: { x: 80, y: 100 },
        dev: { x: 80, y: 320 },
        repo: { x: 300, y: 100 },
        deps: { x: 520, y: 100 },
        deps2: { x: 520, y: 300 },
        token: { x: 760, y: 40 },
        build: { x: 760, y: 210 },
        ci: { x: 760, y: 410 },
        registry: { x: 1010, y: 220 },
        dist: { x: 1240, y: 100 },
        prod: { x: 1460, y: 220 },
        siem: { x: 1120, y: 460 }
      };
      const createdNodes: Record<string, { id: string; categoryId: string }> = {};

      for (const spec of nodeSpecs) {
        const category = nodeCategories.find((candidate) => candidate.id === spec.categoryId);
        if (!category) throw new Error(`Backend has no node category ${spec.categoryId}`);
        const properties = {
          ...createDefaultProperties(category),
          name: spec.name,
          ...spec.values
        };
        const created = await addNode({
          categoryId: spec.categoryId,
          properties,
          position: positions[spec.key]
        });
        createdNodes[spec.key] = created;
      }

      // Queue the build consumer before the workstation consumer so its reverse
      // credential harvest is recorded before dev accesses the same token.
      const edgeSpecs: [string, string, string][] = [
        ['maintainer', 'maintains', 'deps'],
        ['maintainer', 'operates', 'ci'],
        ['repo', 'references', 'deps'],
        ['repo', 'triggers', 'ci'],
        ['repo', 'provides_source', 'build'],
        ['deps', 'consumed_by', 'build'],
        ['deps', 'consumed_by', 'dev'],
        ['deps2', 'consumed_by', 'dev'],
        ['dev', 'accesses', 'token'],
        ['token', 'authenticates', 'build'],
        ['token', 'authenticates', 'ci'],
        ['ci', 'executes', 'build'],
        ['ci', 'publishes', 'registry'],
        ['ci', 'republishes', 'deps'],
        ['ci', 'republishes', 'deps2'],
        ['ci', 'deploys', 'prod'],
        ['build', 'produces', 'registry'],
        ['build', 'logs_to', 'siem'],
        ['registry', 'provides', 'dist'],
        ['registry', 'provides', 'prod'],
        ['dist', 'delivers', 'prod'],
        ['prod', 'monitored_by', 'siem'],
        ['siem', 'alerts', 'dev']
      ];

      for (const [sourceKey, relationshipId, targetKey] of edgeSpecs) {
        const source = createdNodes[sourceKey];
        const target = createdNodes[targetKey];
        if (!source || !target) throw new Error(`Missing example node for ${sourceKey} -> ${targetKey}`);
        const validation = await validateRelationship(source.categoryId, target.categoryId);
        if (!validation.valid || !validation.allowedRelationshipIds.includes(relationshipId)) {
          throw new Error(`Backend rejected ${sourceKey} -${relationshipId}-> ${targetKey}`);
        }
        await addEdge({ sourceNodeId: source.id, targetNodeId: target.id, relationshipId });
      }
    } catch (e) {
      console.error('Failed to load ChainDrop example:', e);
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
            <div className="absolute left-0 mt-2 w-72 rounded-xl bg-[#0F172A] border border-white/10 shadow-2xl shadow-black/60 p-2 z-50 text-xs">
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-white/5">
                Backend Projects ({projects.length})
              </div>

              <div className="max-h-56 overflow-y-auto py-1 space-y-0.5 custom-scrollbar">
                {projects.map((p) => {
                  const isSelected = p.id === projectId;
                  const isEditing = editingProjectId === p.id;
                  const isConfirmingDelete = confirmDeleteProjectId === p.id;

                  return (
                    <div
                      key={p.id}
                      className={`group relative flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                        isSelected
                          ? 'bg-cyan-500/15 text-cyan-300 font-medium'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {isEditing ? (
                        <form
                          onSubmit={(e) => handleEditProjectSubmit(p.id, e)}
                          className="w-full flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={editingProjectName}
                            onChange={(e) => setEditingProjectName(e.target.value)}
                            autoFocus
                            disabled={isSubmittingEditProject}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.stopPropagation();
                                setEditingProjectId(null);
                              }
                            }}
                            className="flex-1 min-w-0 px-2 py-0.5 rounded bg-black/40 border border-cyan-500/50 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                          />
                          <button
                            type="submit"
                            disabled={isSubmittingEditProject || !editingProjectName.trim()}
                            className="p-1 rounded text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-40 transition-colors cursor-pointer"
                            title="Save name (Enter)"
                          >
                            {isSubmittingEditProject ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingProjectId(null)}
                            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
                            title="Cancel (Esc)"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      ) : isConfirmingDelete ? (
                        <div
                          className="w-full flex items-center justify-between gap-1.5 py-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[11px] text-rose-400 font-medium truncate flex items-center gap-1">
                            <Trash2 className="w-3 h-3 shrink-0" />
                            Delete project?
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={isSubmittingDeleteProject}
                              onClick={(e) => handleDeleteProject(p.id, e)}
                              className="px-2 py-0.5 rounded text-[11px] bg-rose-500 hover:bg-rose-600 text-white font-medium transition-colors flex items-center gap-1 cursor-pointer"
                              title="Confirm delete"
                            >
                              {isSubmittingDeleteProject ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                'Delete'
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteProjectId(null)}
                              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              selectProject(p.id);
                              setIsProjectDropdownOpen(false);
                            }}
                            className="flex-1 flex items-center gap-2 min-w-0 text-left cursor-pointer"
                          >
                            <span className="truncate">{p.name}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                          </button>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => handleStartEditProject(p, e)}
                              className="p-1 rounded text-slate-400 hover:text-cyan-400 hover:bg-white/10 transition-colors cursor-pointer"
                              title="Rename project"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteProjectId(p.id);
                                setEditingProjectId(null);
                              }}
                              className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Delete project"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
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

      {/* Center: Mode Toggle (Edit Mode vs Attack Mode) */}
      <div className="flex items-center p-0.5 rounded-xl bg-[#060A12]/80 border border-white/10 text-xs font-medium shadow-inner">
        <button
          onClick={() => setAppMode('edit')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer ${
            appMode === 'edit'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
          title="Edit Mode: Graph editing, node dragging, linking & property editing enabled"
        >
          <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
          <span>Edit Mode</span>
        </button>

        <button
          onClick={() => setAppMode('attack')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer ${
            appMode === 'attack'
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
          title="Attack Mode: Simulation view (Graph editing partitioned/disabled)"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          <span>Attack Mode</span>
        </button>
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
          disabled={isPopulatingSample || !projectId || appMode === 'attack'}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 hover:border-cyan-500/30 rounded-lg transition-all cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
          title={appMode === 'attack' ? 'Load Sample disabled in Attack Mode' : 'Load ChainDrop npm worm example'}
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
          disabled={nodes.length === 0 || appMode === 'attack'}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
          title={appMode === 'attack' ? 'Clear disabled in Attack Mode' : 'Clear all nodes in current project'}
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
