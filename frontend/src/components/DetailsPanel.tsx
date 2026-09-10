import React, { useState, useEffect, useRef } from 'react';
import { useGraphStore } from '../store/graphStore';
import { getProperty, propertiesToObject } from '../types/graph';
import { Trash2, ArrowRight, Link2, Check, X } from 'lucide-react';

const RELATIONSHIP_PRESETS = [
  'Injects credentials into',
  'Triggers build in',
  'Pulls dependency into',
  'Publishes artifact to',
  'Deploys container to',
  'Monitors telemetry from',
  'Enforces branch policy on',
  'Signs artifact with',
  'Authenticates via OIDC',
  'relates to'
];

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
    nodeCategories
  } = useGraphStore();

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId);

  // Local state for debounced node editing
  const [localProps, setLocalProps] = useState<Record<string, any>>({});
  const debounceNodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync localProps when selected node changes
  useEffect(() => {
    if (selectedNode) {
      setLocalProps(propertiesToObject(selectedNode.properties));
    }
  }, [selectedNode?.id]);

  // Local state for debounced edge editing
  const [localRelationship, setLocalRelationship] = useState<string>('');
  const debounceEdgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync localRelationship when selected edge changes
  useEffect(() => {
    if (selectedEdge) {
      setLocalRelationship(selectedEdge.relationship || '');
    }
  }, [selectedEdge?.id]);

  // Handle property change with debounce auto-save
  const handlePropertyChange = (key: string, value: any) => {
    if (!selectedNode) return;

    const updated = { ...localProps, [key]: value };
    setLocalProps(updated);

    if (debounceNodeTimerRef.current) {
      clearTimeout(debounceNodeTimerRef.current);
    }

    debounceNodeTimerRef.current = setTimeout(() => {
      updateNodeProperties(selectedNode.id, updated);
    }, 250);
  };

  // Handle edge relationship change with debounce auto-save
  const handleRelationshipChange = (newRel: string) => {
    if (!selectedEdge) return;

    setLocalRelationship(newRel);

    if (debounceEdgeTimerRef.current) {
      clearTimeout(debounceEdgeTimerRef.current);
    }

    debounceEdgeTimerRef.current = setTimeout(() => {
      updateEdgeRelationship(selectedEdge.id, newRel);
    }, 250);
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceNodeTimerRef.current) clearTimeout(debounceNodeTimerRef.current);
      if (debounceEdgeTimerRef.current) clearTimeout(debounceEdgeTimerRef.current);
    };
  }, []);

  // 1. When nothing is selected
  if (!selectedNode && !selectedEdge) {
    return (
      <aside className="w-[320px] shrink-0 bg-[#080d19] border-l border-slate-900 flex flex-col justify-center items-center p-6 text-center select-none z-20">
        <p className="text-xs text-slate-500 leading-relaxed max-w-[220px]">
          Select a node or edge to view its details.
        </p>
      </aside>
    );
  }

  // 2. When an edge is selected
  if (selectedEdge) {
    const sourceNode = nodes.find((n) => n.id === selectedEdge.sourceNodeId);
    const targetNode = nodes.find((n) => n.id === selectedEdge.targetNodeId);

    const sourceName = sourceNode ? getProperty(sourceNode.properties, 'name') || sourceNode.id : selectedEdge.sourceNodeId;
    const targetName = targetNode ? getProperty(targetNode.properties, 'name') || targetNode.id : selectedEdge.targetNodeId;

    return (
      <aside className="w-[320px] shrink-0 bg-[#080d19] border-l border-slate-900 flex flex-col h-full z-20 select-none">
        {/* Header */}
        <div className="p-4 border-b border-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Edge Relationship
            </span>
          </div>
          <button
            onClick={() => selectEdge(null)}
            className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Connected Endpoints (Read-Only) */}
        <div className="p-4 border-b border-slate-900/80 bg-slate-950/40 text-xs space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] uppercase font-mono text-slate-500">Source</span>
            <span className="text-slate-200 font-medium truncate max-w-[160px]">{sourceName}</span>
          </div>
          <div className="flex items-center justify-center text-slate-600">
            <ArrowRight className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] uppercase font-mono text-slate-500">Target</span>
            <span className="text-slate-200 font-medium truncate max-w-[160px]">{targetName}</span>
          </div>
        </div>

        {/* Editable Relationship Field */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-200">
              Relationship Label
            </label>
            <input
              type="text"
              value={localRelationship}
              onChange={(e) => handleRelationshipChange(e.target.value)}
              placeholder="e.g. Injects credentials into"
              className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-md text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-all font-mono"
            />
            <span className="text-[10px] text-slate-500 block">
              Auto-saves on edit. Appears on canvas when zoom ≥ 1.2.
            </span>
          </div>

          {/* Quick Presets */}
          <div className="space-y-1.5 pt-2">
            <span className="text-[11px] font-medium text-slate-400 block">
              Presets
            </span>
            <div className="flex flex-wrap gap-1">
              {RELATIONSHIP_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleRelationshipChange(preset)}
                  className={`text-[10px] px-2 py-1 rounded border transition-colors font-mono text-left ${
                    localRelationship === preset
                      ? 'bg-sky-500/20 border-sky-500/80 text-sky-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="p-4 border-t border-slate-900 bg-slate-950/40">
          <button
            onClick={() => removeEdge(selectedEdge.id)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Edge</span>
          </button>
        </div>
      </aside>
    );
  }

  // 3. When a node is selected (selectedNode is defined)
  if (!selectedNode) {
    return null;
  }

  const category = nodeCategories.find((c) => c.id === selectedNode.categoryId);
  const color = category?.color || '#06b6d4';

  return (
    <aside className="w-[320px] shrink-0 bg-[#080d19] border-l border-slate-900 flex flex-col h-full z-20 select-none">
      {/* Header with Category (Read-Only) */}
      <div className="p-4 border-b border-slate-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{
                backgroundColor: color,
                boxShadow: `0 0 8px ${color}88`
              }}
            />
            <span className="text-xs font-semibold text-slate-100 uppercase tracking-wider">
              {category?.category || 'Node Inspector'}
            </span>
          </div>

          <button
            onClick={() => selectNode(null)}
            className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-slate-500">
          <span>Category (read-only)</span>
          <span className="truncate max-w-[120px]">{selectedNode.id}</span>
        </div>
      </div>

      {/* Scrollable Dynamic Properties Form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        <div className="flex items-center justify-between pb-1 border-b border-slate-900">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Properties
          </span>
          <span className="text-[10px] font-mono text-emerald-500 flex items-center gap-1">
            <Check className="w-2.5 h-2.5" /> Auto-saved
          </span>
        </div>

        {/* Dynamic inputs from category defaultProperties */}
        {category?.defaultProperties.map((propKey) => {
          const fieldDef = category.fieldDefs?.find((f) => f.key === propKey);
          const label = fieldDef?.label || propKey.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
          const type = fieldDef?.type || (
            propKey.toLowerCase().includes('protection') ||
            propKey.toLowerCase().includes('enabled') ||
            propKey.toLowerCase().includes('required') ||
            propKey.toLowerCase().includes('scanning') ||
            propKey.toLowerCase().includes('ephemeral') ||
            propKey.toLowerCase().includes('zerotrust') ||
            propKey.toLowerCase().includes('immutable')
              ? 'checkbox'
              : 'text'
          );

          const currentValue = localProps[propKey] !== undefined ? localProps[propKey] : '';

          if (type === 'checkbox') {
            const isChecked = !!currentValue;
            return (
              <label
                key={propKey}
                className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition-colors group"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => handlePropertyChange(propKey, e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-sky-500 bg-slate-950 border-slate-700 focus:ring-sky-500/40 accent-sky-500 transition-all cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-medium text-slate-200 group-hover:text-white block">
                    {label}
                  </span>
                  {fieldDef?.description && (
                    <span className="text-[10px] text-slate-500 block mt-0.5 leading-relaxed">
                      {fieldDef.description}
                    </span>
                  )}
                </div>
              </label>
            );
          }

          if (type === 'select' && fieldDef?.options) {
            return (
              <div key={propKey} className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300">
                  {label}
                </label>
                <select
                  value={currentValue}
                  onChange={(e) => handlePropertyChange(propKey, e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-sky-500 transition-all"
                >
                  {fieldDef.options.map((opt) => (
                    <option key={opt} value={opt} className="bg-slate-900 text-slate-200">
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          return (
            <div key={propKey} className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-medium text-slate-300">
                  {label}
                </label>
                {propKey === 'name' && (
                  <span className="text-[9px] font-mono text-sky-400">Node Label</span>
                )}
              </div>
              <input
                type="text"
                value={currentValue}
                onChange={(e) => handlePropertyChange(propKey, e.target.value)}
                placeholder={fieldDef?.placeholder || `Enter ${label}...`}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-md text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-all"
              />
            </div>
          );
        })}
      </div>

      {/* Actions Footer */}
      <div className="p-4 border-t border-slate-900 bg-slate-950/40">
        <button
          onClick={() => removeNode(selectedNode.id)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete Node</span>
        </button>
      </div>
    </aside>
  );
};
