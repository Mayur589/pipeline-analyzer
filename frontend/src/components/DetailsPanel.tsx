import React from 'react';
import { useGraphStore } from '../store/graphStore';
import { CategoryIcon } from './CategoryIcon';
import { getProperty, propertiesToObject } from '../types/graph';
import {
  X,
  Trash2,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  Hash,
  Activity,
  GitCommit
} from 'lucide-react';

export const DetailsPanel: React.FC = () => {
  const {
    nodes,
    edges,
    selectedNodeId,
    selectNode,
    removeNode,
    removeEdge,
    nodeCategories
  } = useGraphStore();

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // If no node selected, show a helpful summary card
  if (!selectedNode) {
    return (
      <aside className="w-[320px] shrink-0 bg-[#0b1120] border-l border-slate-800/80 flex flex-col justify-between p-4 select-none z-20">
        <div>
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-slate-200">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Pipeline Inspector
            </h3>
          </div>

          <div className="mt-8 text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500 mb-3 shadow-inner">
              <Layers className="w-6 h-6 text-slate-500" />
            </div>
            <h4 className="text-xs font-semibold text-slate-300">No Component Selected</h4>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              Click on any supply chain node or drop a new one onto the canvas to inspect its security posture and connections.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="mt-8 space-y-2">
            <span className="text-[10px] font-mono uppercase text-slate-500 block px-1">
              Active Graph Metrics
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Total Nodes</span>
                <span className="text-lg font-bold font-mono text-cyan-400">{nodes.length}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Relationships</span>
                <span className="text-lg font-bold font-mono text-emerald-400">{edges.length}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] text-slate-500 flex items-start gap-2">
          <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <span>Connect nodes by dragging from node edge handles (top/bottom/left/right).</span>
        </div>
      </aside>
    );
  }

  const category = nodeCategories.find((c) => c.id === selectedNode.categoryId);
  const color = category?.color || '#06b6d4';
  const name = getProperty(selectedNode.properties, 'name') || selectedNode.id;
  const propsObj = propertiesToObject(selectedNode.properties);

  // Outgoing and Incoming edges
  const outgoingEdges = edges.filter((e) => e.sourceNodeId === selectedNode.id);
  const incomingEdges = edges.filter((e) => e.targetNodeId === selectedNode.id);

  return (
    <aside className="w-[320px] shrink-0 bg-[#0b1120] border-l border-slate-800/80 flex flex-col h-full z-20 select-none">
      {/* Header */}
      <div
        className="p-4 border-b border-slate-800"
        style={{
          background: `linear-gradient(to bottom, ${color}12, transparent)`
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border shrink-0"
              style={{
                backgroundColor: `${color}20`,
                borderColor: `${color}40`,
                color: color
              }}
            >
              <CategoryIcon iconName={category?.iconName} className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span
                className="text-[10px] font-mono uppercase tracking-wider font-bold block truncate"
                style={{ color }}
              >
                {category?.category || 'Supply Chain Node'}
              </span>
              <h3 className="text-sm font-bold text-slate-100 truncate">{name}</h3>
            </div>
          </div>

          <button
            onClick={() => selectNode(null)}
            title="Deselect"
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-slate-500 pt-2 border-t border-slate-800/80">
          <span className="flex items-center gap-1 truncate">
            <Hash className="w-3 h-3 text-slate-500" />
            {selectedNode.id}
          </span>
          <button
            onClick={() => removeNode(selectedNode.id)}
            className="flex items-center gap-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-1.5 py-0.5 rounded transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
        {/* Dynamic Properties Section */}
        <div>
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <GitCommit className="w-3.5 h-3.5 text-cyan-400" />
              Dynamic Properties
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              {Object.keys(propsObj).length} configured
            </span>
          </div>

          <div className="space-y-2">
            {Object.entries(propsObj).map(([key, value]) => {
              const isBool = typeof value === 'boolean';
              const fieldDef = category?.fieldDefs?.find((f) => f.key === key);
              const label = fieldDef?.label || key.replace(/([A-Z])/g, ' $1');

              return (
                <div
                  key={key}
                  className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/90 space-y-1"
                >
                  <span className="text-[10px] font-mono text-slate-400 block capitalize">
                    {label}
                  </span>
                  {isBool ? (
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold font-mono px-2 py-0.5 rounded ${
                          value
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {value ? (
                          <>
                            <ShieldCheck className="w-3 h-3" /> Enabled / Enforced
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3 h-3" /> Disabled / Unenforced
                          </>
                        )}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-200 font-mono font-medium break-all block">
                      {String(value) || '<empty>'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Connected Edges Section */}
        <div>
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              Connected Edges
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              {incomingEdges.length + outgoingEdges.length} total
            </span>
          </div>

          <div className="space-y-3">
            {/* Outgoing relationships */}
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1 mb-1.5">
                <ArrowDownRight className="w-3 h-3 text-cyan-400" />
                Outgoing ({outgoingEdges.length})
              </span>
              {outgoingEdges.length === 0 ? (
                <span className="text-[11px] text-slate-600 italic block px-1">
                  No downstream targets
                </span>
              ) : (
                <div className="space-y-1.5">
                  {outgoingEdges.map((e) => {
                    const target = nodes.find((n) => n.id === e.targetNodeId);
                    const targetName = target ? getProperty(target.properties, 'name') || target.id : e.targetNodeId;
                    return (
                      <div
                        key={e.id}
                        className="flex items-center justify-between p-2 rounded-md bg-slate-900/60 border border-slate-800 text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <span className="text-[10px] text-cyan-400 font-mono block truncate">
                            {e.relationship}
                          </span>
                          <span className="text-slate-300 font-medium truncate block">
                            → {targetName}
                          </span>
                        </div>
                        <button
                          onClick={() => removeEdge(e.id)}
                          title="Remove Edge"
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Incoming relationships */}
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1 mb-1.5">
                <ArrowUpRight className="w-3 h-3 text-emerald-400" />
                Incoming ({incomingEdges.length})
              </span>
              {incomingEdges.length === 0 ? (
                <span className="text-[11px] text-slate-600 italic block px-1">
                  No upstream sources
                </span>
              ) : (
                <div className="space-y-1.5">
                  {incomingEdges.map((e) => {
                    const source = nodes.find((n) => n.id === e.sourceNodeId);
                    const sourceName = source ? getProperty(source.properties, 'name') || source.id : e.sourceNodeId;
                    return (
                      <div
                        key={e.id}
                        className="flex items-center justify-between p-2 rounded-md bg-slate-900/60 border border-slate-800 text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <span className="text-[10px] text-emerald-400 font-mono block truncate">
                            {e.relationship}
                          </span>
                          <span className="text-slate-300 font-medium truncate block">
                            ← {sourceName}
                          </span>
                        </div>
                        <button
                          onClick={() => removeEdge(e.id)}
                          title="Remove Edge"
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
