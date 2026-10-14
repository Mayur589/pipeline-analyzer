import React, { useState, useEffect, useRef } from 'react';
import { useGraphStore } from '../store/graphStore';
import type { Node, Edge, NodeCategory, NodeProperties } from '../types/graph';
import {
  getProperty,
  propertiesToObject,
  getRelationshipColor,
  getRelationshipGroupInfo,
  formatRelationshipLabel
} from '../types/graph';
import { validateRelationship } from '../api/client';
import {
  ArrowRight,
  X,
  ArrowLeftRight,
  Loader2,
  ShieldAlert,
  Play,
  Flame
} from 'lucide-react';

interface NodeInspectorProps {
  node: Node;
  category?: NodeCategory;
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdateProperties: (id: string, properties: NodeProperties) => Promise<void>;
}

const NodeInspector: React.FC<NodeInspectorProps> = ({
  node,
  category,
  onClose,
  onDelete,
  onUpdateProperties
}) => {
  const {
    nodes,
    edges,
    addEdge,
    removeEdge,
    selectNode,
    selectEdge,
    nodeCategories,
    appMode,
    attackResult,
    isSimulatingAttack,
    runAttackSimulation,
    selectedScenario,
    setSelectedScenario,
    scenarios
  } = useGraphStore();
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [localProps, setLocalProps] = useState<NodeProperties>(() =>
    propertiesToObject(node.properties)
  );
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nodeEdges = edges.filter((e) => e.sourceNodeId === node.id || e.targetNodeId === node.id);
  const otherNodes = nodes.filter((n) => n.id !== node.id);

  const handleAddConnection = async () => {
    if (!selectedTargetId) return;
    const targetNode = nodes.find((n) => n.id === selectedTargetId);
    if (!targetNode) return;

    setIsConnecting(true);
    setConnectError(null);

    try {
      const valid = await validateRelationship(node.categoryId, targetNode.categoryId);
      if (!valid.valid || valid.allowedRelationshipIds.length === 0) {
        setConnectError(`Cannot connect ${category?.category || node.categoryId} to ${targetNode.categoryId}`);
        return;
      }

      await addEdge({
        sourceNodeId: node.id,
        targetNodeId: selectedTargetId,
        relationshipId: valid.allowedRelationshipIds[0]
      });
      setSelectedTargetId('');
    } catch (err: any) {
      console.error('Failed to add connection:', err);
      setConnectError(err.message || 'Failed to connect nodes.');
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!selectedTargetId) return;
    const targetNode = nodes.find((n) => n.id === selectedTargetId);
    if (!targetNode) return;

    validateRelationship(node.categoryId, targetNode.categoryId)
      .then((res) => {
        if (!res.valid || res.allowedRelationshipIds.length === 0) {
          const tgtCat = nodeCategories.find((c) => c.id === targetNode.categoryId)?.category || targetNode.categoryId;
          setConnectError(`Cannot connect: ${category?.category || node.categoryId} → ${tgtCat} is not allowed.`);
        } else {
          setConnectError(null);
        }
      })
      .catch((err) => {
        setConnectError(err.message || 'Validation failed.');
      });
  }, [selectedTargetId, node.categoryId, category, nodeCategories, nodes]);

  const handlePropertyChange = (key: string, value: any) => {
    const updated = { ...localProps, [key]: value };
    setLocalProps(updated);
    setSaveStatus('saving');

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      await onUpdateProperties(node.id, updated);
      setSaveStatus('saved');
    }, 250);
  };

  const color = category?.color || '#06b6d4';
  const nodeName = localProps.name || node.id;
  const isEdit = appMode === 'edit';

  return (
    <aside className="w-[300px] shrink-0 bg-[#0B1220]/80 backdrop-blur-md border-l border-white/5 flex flex-col h-full z-20 select-none">
      {!isEdit && (
        <div className="px-4 py-2.5 bg-rose-500/10 border-b border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
          <span>Attack Mode (Read Only)</span>
        </div>
      )}

      {/* Header with category indicator */}
      <div className="p-5 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-slate-400 truncate">
              {category?.category || 'Supply Chain Node'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isEdit && (
              <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    saveStatus === 'saving' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
                  }`}
                />
                {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            )}

            <button
              onClick={onClose}
              title="Close (Esc)"
              className="p-1 rounded-md text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <h3 className="text-base font-semibold text-slate-100 mt-2 truncate">
          {nodeName}
        </h3>
      </div>

      {/* Attack Mode Simulation Launcher */}
      {!isEdit && (
        <div className="p-4 border-b border-white/5 bg-gradient-to-b from-rose-950/30 to-transparent space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-rose-300 font-semibold text-xs">
              <Flame className="w-4 h-4 text-rose-400" />
              <span>Attack Simulation</span>
            </div>
            {attackResult?.startNodeId === node.id && (
              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-mono border border-rose-500/30">
                Active Origin
              </span>
            )}
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Run a Breadth-First Search (BFS) breach simulation originating from this node.
          </p>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Scenario
            </label>
            <select
              value={selectedScenario}
              onChange={(e) => setSelectedScenario(e.target.value)}
              disabled={isSimulatingAttack}
              className="w-full bg-[#0B1220] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500/60 cursor-pointer disabled:opacity-50"
            >
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={async () => {
              await runAttackSimulation(node.id, selectedScenario);
            }}
            disabled={isSimulatingAttack}
            className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-950/40 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSimulatingAttack ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Simulating Breach...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>{attackResult?.startNodeId === node.id ? 'Re-run Simulation' : 'Simulate Attack'}</span>
              </>
            )}
          </button>

          {/* Node Status in Active Simulation */}
          {attackResult && (() => {
            const isOrigin = attackResult.startNodeId === node.id;
            const stepTraversed = attackResult.steps.find((s) => s.targetNodeId === node.id);

            return (
              <div className="pt-2 border-t border-white/10 space-y-1.5 text-xs">
                {isOrigin ? (
                  <div className="text-rose-300 text-[11px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                    <span>Breach origin node for current simulation</span>
                  </div>
                ) : stepTraversed ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Breach Status:</span>
                      <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                        stepTraversed.outcome === 'COMPROMISED' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                        stepTraversed.outcome === 'SLOWED' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                        stepTraversed.outcome === 'BLOCKED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      }`}>
                        {stepTraversed.outcome}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 italic">{stepTraversed.reason}</p>
                  </div>
                ) : (
                  <div className="text-slate-500 text-[11px]">
                    Not reached in current simulation path.
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Properties List */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
        <div className="text-xs font-medium text-slate-400 uppercase tracking-wider pb-1 border-b border-white/5">
          Properties {!isEdit && '(Locked)'}
        </div>

        {(category?.fieldDefs?.map((f) => f.key) || category?.defaultProperties || []).map((propKey) => {
          const fieldDef = category?.fieldDefs?.find((f) => f.key === propKey);
          const label =
            fieldDef?.label ||
            propKey.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
          const type =
            fieldDef?.type ||
            (propKey.toLowerCase().includes('protection') ||
            propKey.toLowerCase().includes('enabled') ||
            propKey.toLowerCase().includes('required') ||
            propKey.toLowerCase().includes('scanning') ||
            propKey.toLowerCase().includes('ephemeral') ||
            propKey.toLowerCase().includes('zerotrust') ||
            propKey.toLowerCase().includes('immutable')
              ? 'checkbox'
              : 'text');

          const currentValue = localProps[propKey] !== undefined ? localProps[propKey] : '';

          if (type === 'checkbox') {
            const isChecked = !!currentValue;
            return (
              <label
                key={propKey}
                className={`flex items-start gap-3 p-2.5 rounded-lg border border-white/5 transition-colors ${
                  isEdit ? 'hover:bg-white/[0.02] cursor-pointer' : 'opacity-70 cursor-not-allowed'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={!isEdit}
                  onChange={(e) => isEdit && handlePropertyChange(propKey, e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-cyan-500 bg-slate-900 border-white/20 focus:ring-0 accent-cyan-500 transition-all cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="text-xs">
                  <span className="font-medium text-slate-200 block">{label}</span>
                  {fieldDef?.description && (
                    <span className="text-[11px] text-slate-500 block mt-0.5 leading-relaxed">
                      {fieldDef.description}
                    </span>
                  )}
                </div>
              </label>
            );
          }

          if (type === 'select' && fieldDef?.options) {
            return (
              <div key={propKey} className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">{label}</label>
                <select
                  value={String(currentValue ?? '')}
                  disabled={!isEdit}
                  onChange={(e) => isEdit && handlePropertyChange(propKey, e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white/[0.03] border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {fieldDef.options.map((opt) => (
                    <option key={opt} value={opt} className="bg-[#0B1220] text-slate-200">
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          return (
            <div key={propKey} className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">{label}</label>
              <input
                type="text"
                value={String(currentValue ?? '')}
                disabled={!isEdit}
                onChange={(e) => isEdit && handlePropertyChange(propKey, e.target.value)}
                placeholder={fieldDef?.placeholder || `Enter ${label.toLowerCase()}...`}
                className="w-full px-3 py-2 text-xs bg-white/[0.03] border border-white/10 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              />
            </div>
          );
        })}

        {/* Connections Section */}
        <div className="pt-4 border-t border-white/5 space-y-3">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Connected Nodes ({nodeEdges.length})
          </div>

          {/* Connect to Node selector (Edit Mode only) */}
          {isEdit && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <select
                  value={selectedTargetId}
                  onChange={(e) => {
                    setSelectedTargetId(e.target.value);
                    setConnectError(null);
                  }}
                  className="flex-1 px-3 py-1.5 text-xs bg-white/[0.03] border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all truncate cursor-pointer"
                >
                  <option value="" className="bg-[#0B1220] text-slate-400">
                    Connect to node...
                  </option>
                  {otherNodes.map((n) => {
                    const name = getProperty(n.properties, 'name') || n.id;
                    const cat = nodeCategories.find((c) => c.id === n.categoryId)?.category || n.categoryId;
                    return (
                      <option key={n.id} value={n.id} className="bg-[#0B1220] text-slate-200">
                        {name} ({cat})
                      </option>
                    );
                  })}
                </select>

                <button
                  onClick={handleAddConnection}
                  disabled={!selectedTargetId || isConnecting}
                  className="px-3 py-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 hover:border-cyan-500/30 rounded-lg transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer flex items-center gap-1"
                >
                  {isConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Connect'}
                </button>
              </div>

              {connectError && (
                <p className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg leading-tight">
                  {connectError}
                </p>
              )}
            </div>
          )}

          {/* Connected edges list */}
          <div className="space-y-1.5">
            {nodeEdges.length === 0 ? (
              <p className="text-xs text-slate-500 py-1">No connections yet.</p>
            ) : (
              nodeEdges.map((e) => {
                const isOutgoing = e.sourceNodeId === node.id;
                const otherId = isOutgoing ? e.targetNodeId : e.sourceNodeId;
                const otherNode = nodes.find((n) => n.id === otherId);
                const otherName = otherNode
                  ? getProperty(otherNode.properties, 'name') || otherNode.id
                  : otherId;
                const cat = nodeCategories.find((c) => c.id === otherNode?.categoryId);
                const relColor = getRelationshipColor(e.relationshipId);

                return (
                  <div
                    key={e.id}
                    className="p-2 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/10 group text-xs transition-colors space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => selectNode(otherId)}
                        className="flex items-center gap-1.5 truncate text-left hover:text-cyan-300 transition-colors max-w-[210px] cursor-pointer"
                        title={`Focus node ${otherName}`}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: cat?.color || '#06b6d4' }}
                        />
                        <span className="text-slate-400 text-[11px]">
                          {isOutgoing ? '→' : '←'}
                        </span>
                        <span className="text-slate-300 truncate font-medium">{otherName}</span>
                      </button>
                      {isEdit && (
                        <button
                          onClick={() => removeEdge(e.id)}
                          title="Disconnect"
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition-all cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Semantic relationship badge & inspector trigger */}
                    <div className="flex items-center justify-between pl-4">
                      <button
                        onClick={() => selectEdge(e.id)}
                        className="flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded transition-all truncate max-w-[210px] border cursor-pointer"
                        style={{
                          backgroundColor: `${relColor}15`,
                          borderColor: `${relColor}40`,
                          color: relColor
                        }}
                        title="Click to inspect relationship"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: relColor }}
                        />
                        <span className="truncate">{formatRelationshipLabel(e.relationshipId)}</span>
                      </button>
                      <span className="text-[10px] text-slate-500">Inspect</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-5 border-t border-white/5">
        <button
          onClick={() => isEdit && onDelete(node.id)}
          disabled={!isEdit}
          className={`w-full py-2 text-xs font-medium rounded-lg transition-colors text-center ${
            isEdit
              ? 'text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer'
              : 'text-slate-600 bg-white/[0.01] cursor-not-allowed opacity-50'
          }`}
        >
          {isEdit ? 'Delete Node' : 'Delete Disabled in Attack Mode'}
        </button>
      </div>
    </aside>
  );
};

interface EdgeInspectorProps {
  edge: Edge;
  sourceNode?: Node;
  targetNode?: Node;
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdateRelationship: (id: string, relationshipId: string) => Promise<void>;
  onReverse?: (id: string) => Promise<void> | void;
}

const EdgeInspector: React.FC<EdgeInspectorProps> = ({
  edge,
  sourceNode,
  targetNode,
  onClose,
  onDelete,
  onUpdateRelationship,
  onReverse
}) => {
  const { appMode, attackResult, setActiveStepIndex } = useGraphStore();
  const [allowedRels, setAllowedRels] = useState<string[]>([]);
  const [reverseAllowed, setReverseAllowed] = useState(false);
  const [isLoadingRels, setIsLoadingRels] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  const isEdit = appMode === 'edit';
  const sourceCat = sourceNode?.categoryId || '';
  const targetCat = targetNode?.categoryId || '';
  const sourceName = sourceNode
    ? getProperty(sourceNode.properties, 'name') || sourceNode.id
    : edge.sourceNodeId;
  const targetName = targetNode
    ? getProperty(targetNode.properties, 'name') || targetNode.id
    : edge.targetNodeId;

  const simStepIndex = attackResult ? attackResult.steps.findIndex((s) => s.edgeId === edge.id) : -1;
  const simStep = simStepIndex >= 0 ? attackResult!.steps[simStepIndex] : null;

  useEffect(() => {
    if (!sourceCat || !targetCat) return;
    let cancelled = false;

    Promise.all([
      validateRelationship(sourceCat, targetCat),
      validateRelationship(targetCat, sourceCat)
    ])
      .then(([forward, backward]) => {
        if (cancelled) return;
        setAllowedRels(forward.allowedRelationshipIds);
        setReverseAllowed(backward.valid && backward.allowedRelationshipIds.length > 0);
        setIsLoadingRels(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to validate connection with backend:', err);
        setIsLoadingRels(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sourceCat, targetCat]);

  const groupInfo = getRelationshipGroupInfo(edge.relationshipId);

  const handleRelationshipSelect = async (newRelId: string) => {
    if (!isEdit) return;
    setSaveStatus('saving');
    try {
      await onUpdateRelationship(edge.id, newRelId);
      setSaveStatus('saved');
    } catch (e) {
      console.error('Failed to update relationship:', e);
      setSaveStatus('saved');
    }
  };

  return (
    <aside className="w-[300px] shrink-0 bg-[#0B1220]/80 backdrop-blur-md border-l border-white/5 flex flex-col h-full z-20 select-none">
      {!isEdit && (
        <div className="px-4 py-2.5 bg-rose-500/10 border-b border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
          <span>Attack Mode (Read Only)</span>
        </div>
      )}

      {/* Header */}
      <div className="p-5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-200">Relationship</h3>
          {isEdit && (
            <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  saveStatus === 'saving' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
                }`}
              />
              {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
            </span>
          )}
        </div>

        <button
          onClick={onClose}
          title="Close (Esc)"
          className="p-1 rounded-md text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Connected Endpoints */}
      <div className="p-5 border-b border-white/5 text-xs space-y-2.5 text-slate-400">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">From</span>
          <div className="flex items-center gap-1.5 text-right min-w-0">
            <span className="text-slate-200 font-medium truncate max-w-[125px]">{sourceName}</span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-cyan-400 shrink-0">
              {sourceCat}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-center text-slate-600">
          <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">To</span>
          <div className="flex items-center gap-1.5 text-right min-w-0">
            <span className="text-slate-200 font-medium truncate max-w-[125px]">{targetName}</span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-cyan-400 shrink-0">
              {targetCat}
            </span>
          </div>
        </div>
      </div>

      {/* Simulation Hop Details */}
      {!isEdit && simStep && (
        <div className="p-4 border-b border-white/5 bg-white/5 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium">Hop {simStepIndex + 1} Outcome:</span>
            <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
              simStep.outcome === 'COMPROMISED' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
              simStep.outcome === 'SLOWED' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
              simStep.outcome === 'BLOCKED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
              'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
            }`}>
              {simStep.outcome}
            </span>
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">{simStep.reason}</p>
          {simStep.controlsTriggered.length > 0 && (
            <div className="pt-1">
              <span className="text-[10px] text-slate-400">Triggered Controls: </span>
              <span className="text-cyan-300 font-mono text-[10px]">{simStep.controlsTriggered.join(', ')}</span>
            </div>
          )}
          <button
            onClick={() => setActiveStepIndex(simStepIndex)}
            className="mt-2 w-full py-1.5 px-2.5 rounded bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium transition-colors cursor-pointer"
          >
            Jump to Hop {simStepIndex + 1}
          </button>
        </div>
      )}

      {/* Semantic Relationship Editor */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-slate-300">Relationship Type</label>
            {isLoadingRels && <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />}
          </div>

          <select
            value={edge.relationshipId}
            disabled={!isEdit}
            onChange={(e) => isEdit && handleRelationshipSelect(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-[#0F172A] border border-white/10 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all font-sans cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {allowedRels.length > 0 ? (
              allowedRels.map((relId) => {
                const label = formatRelationshipLabel(relId);
                return (
                  <option key={relId} value={relId} className="bg-[#0F172A] text-slate-100">
                    {label}
                  </option>
                );
              })
            ) : (
              <option value={edge.relationshipId} className="bg-[#0F172A] text-slate-100">
                {formatRelationshipLabel(edge.relationshipId)}
              </option>
            )}
          </select>
          <p className="text-[10px] text-slate-500">
            {isEdit
              ? `Dropdown contains valid relationships validated by backend for ${sourceCat} → ${targetCat}.`
              : 'Editing disabled in Attack Mode.'}
          </p>
        </div>

        {/* Semantic Definition Card */}
        <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: groupInfo.color }}
              />
              <span className="text-xs font-semibold text-slate-200">
                {formatRelationshipLabel(edge.relationshipId)}
              </span>
            </div>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-white/5"
              style={{ color: groupInfo.color }}
            >
              {groupInfo.group}
            </span>
          </div>

          <div className="text-xs text-slate-400 leading-relaxed pt-2 border-t border-white/5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1 font-semibold">
              Relationship ID
            </span>
            <code className="text-cyan-400 font-mono text-[11px]">{edge.relationshipId}</code>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-5 border-t border-white/5 space-y-2">
        {onReverse && (
          <div>
            <button
              onClick={() => isEdit && onReverse(edge.id)}
              disabled={!reverseAllowed || !isEdit}
              title={
                !isEdit
                  ? 'Reverse disabled in Attack Mode'
                  : reverseAllowed
                  ? 'Reverse connection direction'
                  : 'Reversed connection is not permitted by backend validation'
              }
              className={`w-full py-2 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                reverseAllowed && isEdit
                  ? 'text-slate-300 hover:text-white bg-white/[0.03] hover:bg-white/10 border border-white/10 cursor-pointer'
                  : 'text-slate-600 bg-white/[0.01] border border-white/5 cursor-not-allowed opacity-60'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400" />
              <span>{reverseAllowed ? 'Reverse Direction' : 'Reverse Disallowed'}</span>
            </button>
            {!reverseAllowed && isEdit && (
              <span className="block text-[10px] text-slate-500 text-center mt-1">
                Reverse direction not permitted for this category pair
              </span>
            )}
          </div>
        )}
        <button
          onClick={() => isEdit && onDelete(edge.id)}
          disabled={!isEdit}
          className={`w-full py-2 text-xs font-medium rounded-lg transition-colors text-center ${
            isEdit
              ? 'text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer'
              : 'text-slate-600 bg-white/[0.01] cursor-not-allowed opacity-50'
          }`}
        >
          {isEdit ? 'Delete Relationship' : 'Delete Disabled in Attack Mode'}
        </button>
      </div>
    </aside>
  );
};

export const DetailsPanel: React.FC = () => {
  const {
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    selectNode,
    selectEdge,
    removeNode,
    removeEdge,
    updateNodeProperties,
    updateEdgeRelationship,
    reverseEdge,
    nodeCategories,
    appMode,
    attackResult,
    clearAttackSimulation,
    activeStepIndex,
    setActiveStepIndex
  } = useGraphStore();

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId);

  // Keyboard shortcut listener (Escape to deselect)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedNodeId) selectNode(null);
        if (selectedEdgeId) selectEdge(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, selectedEdgeId, selectNode, selectEdge]);

  if (!selectedNode && !selectedEdge) {
    if (appMode === 'attack' && attackResult) {
      const startNode = nodes.find((n) => n.id === attackResult.startNodeId);
      const startName = startNode ? getProperty(startNode.properties, 'name') || startNode.id : attackResult.startNodeId;

      return (
        <aside className="w-[300px] shrink-0 bg-[#0B1220]/80 backdrop-blur-md border-l border-white/5 flex flex-col h-full z-20 select-none animate-fade-in">
          <div className="px-4 py-2.5 bg-rose-500/10 border-b border-rose-500/20 text-xs text-rose-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="font-semibold">Attack Trace Overview</span>
            </div>
            <button
              onClick={clearAttackSimulation}
              className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 border-b border-white/5 space-y-3">
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Scenario</span>
              <h3 className="text-sm font-semibold text-slate-100 mt-0.5 truncate">
                {formatRelationshipLabel(attackResult.scenario)}
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Origin: <span className="text-rose-300 font-medium">{startName}</span>
              </p>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/10">
              <span className="text-xs text-slate-400">Severity</span>
              <span className={`px-2 py-0.5 rounded font-bold text-xs ${
                attackResult.overallSeverity.label === 'Critical' ? 'bg-rose-500/20 text-rose-300' :
                attackResult.overallSeverity.label === 'High' ? 'bg-amber-500/20 text-amber-300' :
                attackResult.overallSeverity.label === 'Medium' ? 'bg-yellow-500/20 text-yellow-300' :
                'bg-emerald-500/20 text-emerald-300'
              }`}>
                {attackResult.overallSeverity.label} ({attackResult.overallSeverity.score.toFixed(1)}/10)
              </span>
            </div>
          </div>

          {/* Step Trace List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider pb-1 border-b border-white/5 flex items-center justify-between">
              <span>Simulation Path</span>
              <span>{attackResult.steps.length} hops</span>
            </div>

            {attackResult.steps.map((step, idx) => {
              const isCurrent = idx === activeStepIndex;
              const srcNode = nodes.find((n) => n.id === step.sourceNodeId);
              const tgtNode = nodes.find((n) => n.id === step.targetNodeId);
              const sName = srcNode ? getProperty(srcNode.properties, 'name') || srcNode.id : step.sourceNodeId;
              const tName = tgtNode ? getProperty(tgtNode.properties, 'name') || tgtNode.id : step.targetNodeId;

              return (
                <div
                  key={step.edgeId + idx}
                  onClick={() => setActiveStepIndex(idx)}
                  className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                    isCurrent
                      ? 'bg-white/10 border-cyan-500/60 shadow-md'
                      : 'bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-mono text-[10px] text-slate-400">Hop {idx + 1}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      step.outcome === 'COMPROMISED' ? 'bg-rose-500/20 text-rose-400' :
                      step.outcome === 'SLOWED' ? 'bg-amber-500/20 text-amber-400' :
                      step.outcome === 'BLOCKED' ? 'bg-emerald-500/20 text-emerald-400' :
                      'bg-cyan-500/20 text-cyan-400'
                    }`}>
                      {step.outcome}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-200 truncate">
                    {sName} → {tName}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {step.reason}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 border-t border-white/5">
            <button
              onClick={clearAttackSimulation}
              className="w-full py-2 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
            >
              Clear Simulation
            </button>
          </div>
        </aside>
      );
    }
    return null;
  }

  if (selectedEdge) {
    const sourceNode = nodes.find((n) => n.id === selectedEdge.sourceNodeId);
    const targetNode = nodes.find((n) => n.id === selectedEdge.targetNodeId);

    return (
      <EdgeInspector
        key={selectedEdge.id}
        edge={selectedEdge}
        sourceNode={sourceNode}
        targetNode={targetNode}
        onClose={() => selectEdge(null)}
        onDelete={removeEdge}
        onUpdateRelationship={updateEdgeRelationship}
        onReverse={reverseEdge}
      />
    );
  }

  if (selectedNode) {
    const category = nodeCategories.find((c) => c.id === selectedNode.categoryId);

    return (
      <NodeInspector
        key={selectedNode.id}
        node={selectedNode}
        category={category}
        onClose={() => selectNode(null)}
        onDelete={removeNode}
        onUpdateProperties={updateNodeProperties}
      />
    );
  }

  return null;
};
