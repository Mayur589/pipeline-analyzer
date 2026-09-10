import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { useGraphStore } from '../store/graphStore';
import { CategoryIcon } from './CategoryIcon';
import { getProperty, propertiesToObject } from '../types/graph';
import { Trash2, ShieldCheck, AlertCircle } from 'lucide-react';

export const CustomNode = memo(({ id, data, selected }: NodeProps) => {
  const { nodeCategories, removeNode, selectNode } = useGraphStore();
  const categoryId = (data?.categoryId as string) || '';
  const properties = data?.properties as any;

  const category = nodeCategories.find((c) => c.id === categoryId);
  const color = category?.color || '#06b6d4';
  const name = getProperty(properties, 'name') || id;

  const propsObj = propertiesToObject(properties);
  const nonNameProps = Object.entries(propsObj).filter(([k]) => k !== 'name');

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeNode(id);
  };

  return (
    <div
      onClick={() => selectNode(id)}
      className={`group relative rounded-xl bg-[#0b1120]/95 backdrop-blur-md border transition-all duration-200 min-w-[240px] max-w-[280px] shadow-lg ${
        selected
          ? 'border-cyan-400 ring-2 ring-cyan-500/30 shadow-cyan-500/20 shadow-xl'
          : 'border-slate-850 hover:border-slate-700 hover:shadow-slate-900/50'
      }`}
      style={{
        boxShadow: selected ? `0 0 20px ${color}33` : undefined
      }}
    >
      {/* Target Handle (Top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!top-[-5px] !bg-[#0b1120] !border-cyan-400 !w-3 !h-3 transition-transform"
        id="target-top"
      />
      {/* Target Handle (Left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!left-[-5px] !bg-[#0b1120] !border-cyan-400 !w-2.5 !h-2.5 transition-transform"
        id="target-left"
      />

      {/* Card Header */}
      <div
        className="flex items-center justify-between p-3 border-b border-slate-800/80 rounded-t-xl"
        style={{
          background: `linear-gradient(to right, ${color}12, transparent)`
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border"
            style={{
              backgroundColor: `${color}18`,
              borderColor: `${color}40`,
              color: color
            }}
          >
            <CategoryIcon iconName={category?.iconName} className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider block truncate"
              style={{ color }}
            >
              {category?.category || 'Supply Chain Node'}
            </span>
            <span className="text-[10px] font-mono text-slate-500 block truncate">
              {id.split('_').slice(0, 2).join('_')}
            </span>
          </div>
        </div>

        {/* Delete button */}
        <button
          onClick={handleDelete}
          title="Delete Node"
          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Card Body */}
      <div className="p-3 space-y-2">
        {/* Node Name */}
        <div>
          <div className="text-xs font-semibold text-slate-100 truncate flex items-center gap-1.5">
            <span>{name}</span>
          </div>
        </div>

        {/* Dynamic Property Chips */}
        {nonNameProps.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-slate-800/60">
            {nonNameProps.slice(0, 3).map(([key, val]) => {
              const isBool = typeof val === 'boolean';
              return (
                <div
                  key={key}
                  className="flex items-center justify-between text-[10px] py-0.5"
                >
                  <span className="text-slate-400 font-mono capitalize truncate mr-2">
                    {key.replace(/([A-Z])/g, ' $1')}:
                  </span>
                  {isBool ? (
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono ${
                        val
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {val ? (
                        <>
                          <ShieldCheck className="w-2.5 h-2.5" /> Enforced
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-2.5 h-2.5" /> Disabled
                        </>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-300 font-mono truncate max-w-[120px] bg-slate-800/60 px-1.5 py-0.5 rounded border border-slate-800">
                      {String(val)}
                    </span>
                  )}
                </div>
              );
            })}
            {nonNameProps.length > 3 && (
              <div className="text-[9px] text-slate-500 text-right pt-0.5 font-mono">
                +{nonNameProps.length - 3} more properties
              </div>
            )}
          </div>
        )}
      </div>

      {/* Source Handle (Bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bottom-[-5px] !bg-[#0b1120] !border-cyan-400 !w-3 !h-3 transition-transform"
        id="source-bottom"
      />
      {/* Source Handle (Right) */}
      <Handle
        type="source"
        position={Position.Right}
        className="!right-[-5px] !bg-[#0b1120] !border-cyan-400 !w-2.5 !h-2.5 transition-transform"
        id="source-right"
      />
    </div>
  );
});

CustomNode.displayName = 'CustomNode';
