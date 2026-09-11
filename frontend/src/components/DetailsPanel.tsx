import React, { useState, useEffect, useRef } from 'react';
import { useGraphStore } from '../store/graphStore';
import type { Node, Edge, NodeCategory, NodeProperties } from '../types/graph';
import { getProperty, propertiesToObject } from '../types/graph';
import {
  RELATIONSHIPS_BY_ID,
  getValidRelationships,
  getRelationshipColor,
  getRelationshipGroupInfo
} from '../mock-api/relationships';
import { ArrowRight, X, Link2, ImageOff, ArrowLeftRight } from 'lucide-react';

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
  const { nodes, edges, addEdge, removeEdge, selectNode, selectEdge, nodeCategories } = useGraphStore();
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [localProps, setLocalProps] = useState<NodeProperties>(() =>
    propertiesToObject(node.properties)
  );
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nodeEdges = edges.filter((e) => e.sourceNodeId === node.id || e.targetNodeId === node.id);
  const otherNodes = nodes.filter((n) => n.id !== node.id);

  // Only permit connections where the rule matrix permits valid relationships
  const validTargetNodes = otherNodes.filter((n) => {
    const valid = getValidRelationships(node.categoryId, n.categoryId);
    return valid.valid;
  });

  const handleAddConnection = async () => {
    if (!selectedTargetId) return;
    const targetNode = nodes.find((n) => n.id === selectedTargetId);
    if (!targetNode) return;

    const valid = getValidRelationships(node.categoryId, targetNode.categoryId);
    if (!valid.valid || valid.relationships.length === 0) return;

    try {
      await addEdge({
        sourceNodeId: node.id,
        targetNodeId: selectedTargetId,
        relationshipId: valid.relationships[0].id
      });
      setSelectedTargetId('');
    } catch (err) {
      console.error('Failed to add connection:', err);
    }
  };

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

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
              className="p-1 rounded-md text-slate-500 hover:text-slate-300 transition-colors"
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
                  className="w-full px-3 py-2 text-xs bg-white/[0.03] border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all"
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
                placeholder={fieldDef?.placeholder || `Enter ${label}...`}
                className="w-full px-3 py-2 text-xs bg-white/[0.03] border border-white/10 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all"
              />
            </div>
          );
        })}

        {/* Custom Node Image / Icon Section */}
        {Boolean(localProps.imageUrl || localProps.image) && (
          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">Custom Image</span>
              <span className="text-[10px] text-emerald-400 font-mono">Active</span>
            </div>
            {localProps.imageUrl && (
              <img
                src={String(localProps.imageUrl)}
                alt="Node thumbnail"
                className="w-14 h-14 rounded-lg object-cover border border-white/10"
              />
            )}
            <button
              type="button"
              onClick={() => {
                const updated = { ...localProps };
                delete updated.imageUrl;
                delete updated.image;
                setLocalProps(updated);
                onUpdateProperties(node.id, updated);
              }}
              className="w-full py-1.5 px-2.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-colors text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ImageOff className="w-3.5 h-3.5" />
              <span>Remove Image from Node</span>
            </button>
          </div>
        )}

        {/* Connections Section */}
        <div className="pt-3 border-t border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Connections ({nodeEdges.length})</span>
            </span>
          </div>

          {/* Quick Connect dropdown (Filtered to categories allowed by rule matrix) */}
          {validTargetNodes.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <select
                value={selectedTargetId}
                onChange={(e) => setSelectedTargetId(e.target.value)}
                className="flex-1 px-2.5 py-1.5 text-xs bg-white/[0.03] border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500/50"
              >
                <option value="" className="bg-[#0B1220] text-slate-400">
                  Connect to valid node...
                </option>
                {validTargetNodes.map((on) => {
                  const onName = getProperty(on.properties, 'name') || on.id;
                  const isConnected = nodeEdges.some(
                    (e) =>
                      (e.sourceNodeId === node.id && e.targetNodeId === on.id) ||
                      (e.targetNodeId === node.id && e.sourceNodeId === on.id)
                  );
                  return (
                    <option
                      key={on.id}
                      value={on.id}
                      disabled={isConnected}
                      className="bg-[#0B1220] text-slate-200"
                    >
                      {onName} {isConnected ? '(connected)' : ''}
                    </option>
                  );
                })}
              </select>
              <button
                onClick={handleAddConnection}
                disabled={!selectedTargetId}
                className="px-2.5 py-1.5 text-xs font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                Link
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 italic">No compatible targets allowed by rule matrix.</p>
          )}

          {/* Existing Connections list */}
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {nodeEdges.length === 0 ? (
              <p className="text-[11px] text-slate-500 italic">No connections</p>
            ) : (
              nodeEdges.map((e) => {
                const isOutgoing = e.sourceNodeId === node.id;
                const otherId = isOutgoing ? e.targetNodeId : e.sourceNodeId;
                const otherNode = nodes.find((n) => n.id === otherId);
                const otherName = otherNode
                  ? getProperty(otherNode.properties, 'name') || otherNode.id
                  : otherId;
                const cat = nodeCategories.find((c) => c.id === otherNode?.categoryId);
                const relDef = RELATIONSHIPS_BY_ID[e.relationshipId];
                const relColor = getRelationshipColor(e.relationshipId);

                return (
                  <div
                    key={e.id}
                    className="p-2 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/10 group text-xs transition-colors space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => selectNode(otherId)}
                        className="flex items-center gap-1.5 truncate text-left hover:text-cyan-300 transition-colors max-w-[210px]"
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
                        <span className="truncate">{relDef?.label || e.relationshipId}</span>
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
          className="w-full py-2 text-xs font-medium text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors text-center"
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

  const sourceName = sourceNode
    ? getProperty(sourceNode.properties, 'name') || sourceNode.id
    : edge.sourceNodeId;
  const targetName = targetNode
    ? getProperty(targetNode.properties, 'name') || targetNode.id
    : edge.targetNodeId;

  const sourceCat = sourceNode?.categoryId || '';
  const targetCat = targetNode?.categoryId || '';

  const validResult =
    sourceNode && targetNode
      ? getValidRelationships(sourceCat, targetCat)
      : { valid: false, relationships: [] };

  const currentDef = RELATIONSHIPS_BY_ID[edge.relationshipId];
  const groupInfo = getRelationshipGroupInfo(edge.relationshipId);

  const reverseAllowed =
    targetNode && sourceNode
      ? getValidRelationships(targetCat, sourceCat).valid
      : false;

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
          <label className="block text-xs font-medium text-slate-300">Relationship Type</label>
          <select
            value={edge.relationshipId}
            onChange={(e) => handleRelationshipSelect(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-[#0F172A] border border-white/10 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all font-sans cursor-pointer"
          >
            {validResult.relationships.map((rel) => (
              <option key={rel.id} value={rel.id} className="bg-[#0F172A] text-slate-100">
                {rel.label}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-500">
            Dropdown contains only valid relationships defined for {sourceCat} → {targetCat}.
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
                {currentDef?.label || edge.relationshipId}
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
              Description
            </span>
            {currentDef?.description || 'Semantic link coordinating pipeline components.'}
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
                  : 'Reversed connection is not permitted by the rule matrix'
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
                Reverse direction not permitted in rule matrix
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
