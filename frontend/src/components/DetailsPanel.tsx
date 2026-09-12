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
import { ArrowRight, X, ArrowLeftRight, Loader2, Link2 } from 'lucide-react';

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
    connectSourceId,
    setConnectSourceId
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

  return (
    <aside className="w-[300px] shrink-0 bg-[#0B1220]/80 backdrop-blur-md border-l border-white/5 flex flex-col h-full z-20 select-none">
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
            <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  saveStatus === 'saving' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
                }`}
              />
              {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
            </span>

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

      {/* Properties List */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
        <div className="text-xs font-medium text-slate-400 uppercase tracking-wider pb-1 border-b border-white/5">
          Properties
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
                className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-white/[0.02] border border-white/5 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => handlePropertyChange(propKey, e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-cyan-500 bg-slate-900 border-white/20 focus:ring-0 accent-cyan-500 transition-all cursor-pointer"
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
                  onChange={(e) => handlePropertyChange(propKey, e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white/[0.03] border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all cursor-pointer"
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
                onChange={(e) => handlePropertyChange(propKey, e.target.value)}
                placeholder={fieldDef?.placeholder || `Enter ${label.toLowerCase()}...`}
                className="w-full px-3 py-2 text-xs bg-white/[0.03] border border-white/10 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all"
              />
            </div>
          );
        })}

        {/* Connections Section */}
        <div className="pt-4 border-t border-white/5 space-y-3">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Connected Nodes ({nodeEdges.length})
          </div>

          {/* Canvas Connect Mode trigger button */}
          <button
            onClick={() => setConnectSourceId(connectSourceId === node.id ? null : node.id)}
            className={`w-full py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-2 border transition-all cursor-pointer ${
              connectSourceId === node.id
                ? 'bg-cyan-500/25 text-cyan-200 border-cyan-500/50 shadow-lg shadow-cyan-500/10'
                : 'bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/[0.08] border-white/10'
            }`}
          >
            <Link2 className={`w-3.5 h-3.5 ${connectSourceId === node.id ? 'text-cyan-400 animate-spin' : 'text-slate-400'}`} />
            <span>{connectSourceId === node.id ? 'Connecting: Hover target node on canvas...' : 'Connect to Node (Canvas Mode)'}</span>
          </button>

          {/* Connect to Node selector */}
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
                      <button
                        onClick={() => removeEdge(e.id)}
                        title="Disconnect"
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition-all cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
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
          onClick={() => onDelete(node.id)}
          className="w-full py-2 text-xs font-medium text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors text-center cursor-pointer"
        >
          Delete Node
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
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [allowedRels, setAllowedRels] = useState<string[]>([]);
  const [reverseAllowed, setReverseAllowed] = useState(false);
  const [isLoadingRels, setIsLoadingRels] = useState(false);

  const sourceName = sourceNode
    ? getProperty(sourceNode.properties, 'name') || sourceNode.id
    : edge.sourceNodeId;
  const targetName = targetNode
    ? getProperty(targetNode.properties, 'name') || targetNode.id
    : edge.targetNodeId;

  const sourceCat = sourceNode?.categoryId || '';
  const targetCat = targetNode?.categoryId || '';

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
      {/* Header */}
      <div className="p-5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-200">Relationship</h3>
          <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                saveStatus === 'saving' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
              }`}
            />
            {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
          </span>
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

      {/* Semantic Relationship Editor */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-slate-300">Relationship Type</label>
            {isLoadingRels && <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />}
          </div>

          <select
            value={edge.relationshipId}
            onChange={(e) => handleRelationshipSelect(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-[#0F172A] border border-white/10 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all font-sans cursor-pointer"
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
            Dropdown contains valid relationships validated by backend for {sourceCat} → {targetCat}.
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
              onClick={() => onReverse(edge.id)}
              disabled={!reverseAllowed}
              title={
                reverseAllowed
                  ? 'Reverse connection direction'
                  : 'Reversed connection is not permitted by backend validation'
              }
              className={`w-full py-2 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                reverseAllowed
                  ? 'text-slate-300 hover:text-white bg-white/[0.03] hover:bg-white/10 border border-white/10 cursor-pointer'
                  : 'text-slate-600 bg-white/[0.01] border border-white/5 cursor-not-allowed opacity-60'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400" />
              <span>{reverseAllowed ? 'Reverse Direction' : 'Reverse Disallowed'}</span>
            </button>
            {!reverseAllowed && (
              <span className="block text-[10px] text-slate-500 text-center mt-1">
                Reverse direction not permitted for this category pair
              </span>
            )}
          </div>
        )}
        <button
          onClick={() => onDelete(edge.id)}
          className="w-full py-2 text-xs font-medium text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors text-center cursor-pointer"
        >
          Delete Relationship
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
    nodeCategories
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
    return (
      <aside className="w-[300px] shrink-0 bg-[#0B1220]/80 backdrop-blur-md border-l border-white/5 flex flex-col justify-center items-center p-6 text-center select-none z-20">
        <p className="text-xs text-slate-500 leading-relaxed max-w-[200px]">
          Select a node or relationship to inspect and edit properties.
        </p>
      </aside>
    );
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
