import React, { useState, useEffect, useRef } from 'react';
import { useGraphStore } from '../store/graphStore';
import type { Node, Edge, NodeCategory } from '../types/graph';
import { getProperty, propertiesToObject } from '../types/graph';
import { ArrowRight, X } from 'lucide-react';

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

interface NodeInspectorProps {
  node: Node;
  category?: NodeCategory;
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdateProperties: (id: string, properties: Record<string, any>) => Promise<void>;
}

const NodeInspector: React.FC<NodeInspectorProps> = ({
  node,
  category,
  onClose,
  onDelete,
  onUpdateProperties
}) => {
  const [localProps, setLocalProps] = useState<Record<string, any>>(() =>
    propertiesToObject(node.properties)
  );
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

        {category?.defaultProperties.map((propKey) => {
          const fieldDef = category.fieldDefs?.find((f) => f.key === propKey);
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
                  value={currentValue}
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
                value={currentValue}
                onChange={(e) => handlePropertyChange(propKey, e.target.value)}
                placeholder={fieldDef?.placeholder || `Enter ${label}...`}
                className="w-full px-3 py-2 text-xs bg-white/[0.03] border border-white/10 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all"
              />
            </div>
          );
        })}
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
  onUpdateRelationship: (id: string, relationship: string) => Promise<void>;
}

const EdgeInspector: React.FC<EdgeInspectorProps> = ({
  edge,
  sourceNode,
  targetNode,
  onClose,
  onDelete,
  onUpdateRelationship
}) => {
  const [localRelationship, setLocalRelationship] = useState(() => edge.relationship || '');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const handleRelationshipChange = (newRel: string) => {
    setLocalRelationship(newRel);
    setSaveStatus('saving');

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      await onUpdateRelationship(edge.id, newRel);
      setSaveStatus('saved');
    }, 250);
  };

  const sourceName = sourceNode
    ? getProperty(sourceNode.properties, 'name') || sourceNode.id
    : edge.sourceNodeId;
  const targetName = targetNode
    ? getProperty(targetNode.properties, 'name') || targetNode.id
    : edge.targetNodeId;

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
          className="p-1 rounded-md text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Connected Endpoints */}
      <div className="p-5 border-b border-white/5 text-xs space-y-2 text-slate-400">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">From</span>
          <span className="text-slate-200 font-medium truncate max-w-[170px]">{sourceName}</span>
        </div>
        <div className="flex items-center justify-center text-slate-600">
          <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">To</span>
          <span className="text-slate-200 font-medium truncate max-w-[170px]">{targetName}</span>
        </div>
      </div>

      {/* Relationship editor */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-300">Relationship Label</label>
          <input
            type="text"
            value={localRelationship}
            onChange={(e) => handleRelationshipChange(e.target.value)}
            placeholder="e.g. Injects credentials into"
            className="w-full px-3 py-2 text-xs bg-white/[0.03] border border-white/10 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all font-mono"
          />
        </div>

        <div className="space-y-1.5 pt-2">
          <span className="text-xs text-slate-500 block">Suggestions</span>
          <div className="flex flex-wrap gap-1.5">
            {RELATIONSHIP_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleRelationshipChange(preset)}
                className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors text-left ${
                  localRelationship === preset
                    ? 'bg-white/10 border-white/30 text-white'
                    : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/15'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-5 border-t border-white/5">
        <button
          onClick={() => onDelete(edge.id)}
          className="w-full py-2 text-xs font-medium text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors text-center"
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
