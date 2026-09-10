import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { useGraphStore } from '../store/graphStore';
import { getProperty } from '../types/graph';

export const CustomNode = memo(({ id, data, selected }: NodeProps) => {
  const { nodeCategories, selectNode } = useGraphStore();
  const categoryId = (data?.categoryId as string) || '';
  const properties = data?.properties as any;

  const category = nodeCategories.find((c) => c.id === categoryId);
  const color = category?.color || '#06b6d4';
  const name = getProperty(properties, 'name') || id;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectNode(id);
  };

  return (
    <div
      onClick={handleClick}
      className="group relative flex flex-col items-center justify-center cursor-pointer select-none"
    >
      {/* Invisible/subtle connection handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-slate-400 !border-none opacity-0 group-hover:opacity-70 transition-opacity !top-[-4px]"
        id="target-top"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-slate-400 !border-none opacity-0 group-hover:opacity-70 transition-opacity !left-[-4px]"
        id="target-left"
      />

      {/* Obsidian Node Dot */}
      <div className="relative flex items-center justify-center">
        {/* Selection / Hover Halo */}
        <div
          className={`absolute rounded-full transition-all duration-300 ${
            selected
              ? 'w-7 h-7 opacity-80 animate-pulse-subtle'
              : 'w-4 h-4 opacity-0 group-hover:w-6 group-hover:h-6 group-hover:opacity-40'
          }`}
          style={{
            backgroundColor: color,
            filter: 'blur(3px)'
          }}
        />

        {/* Core Node Circle */}
        <div
          className={`relative rounded-full transition-all duration-200 ${
            selected
              ? 'w-4 h-4 ring-2 ring-white ring-offset-2 ring-offset-[#070a13] scale-110 shadow-lg'
              : 'w-3.5 h-3.5 group-hover:scale-125 shadow-md'
          }`}
          style={{
            backgroundColor: color,
            boxShadow: selected
              ? `0 0 16px ${color}, 0 0 4px ${color}`
              : `0 0 8px ${color}88`
          }}
        />
      </div>

      {/* Node Name Label */}
      <div className="mt-1.5 px-1.5 py-0.5 max-w-[140px] text-center pointer-events-none">
        <span
          className={`text-[11px] font-medium tracking-tight block truncate transition-colors duration-150 ${
            selected
              ? 'text-white font-semibold'
              : 'text-slate-300 group-hover:text-white'
          }`}
          style={{
            textShadow: '0 1px 4px rgba(0, 0, 0, 0.9), 0 0 10px rgba(0,0,0,0.8)'
          }}
        >
          {name}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-slate-400 !border-none opacity-0 group-hover:opacity-70 transition-opacity !bottom-[-4px]"
        id="source-bottom"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-slate-400 !border-none opacity-0 group-hover:opacity-70 transition-opacity !right-[-4px]"
        id="source-right"
      />
    </div>
  );
});

CustomNode.displayName = 'CustomNode';
