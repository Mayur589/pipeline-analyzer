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
      className="relative flex items-center justify-center cursor-pointer select-none"
      style={{ width: 84, height: 84 }}
    >
      {/* 4 Connectors: Top, Right, Bottom, Left - Equidistant and exactly on circumference */}
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        className="opacity-80 hover:opacity-100 transition-opacity cursor-crosshair"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        className="opacity-80 hover:opacity-100 transition-opacity cursor-crosshair"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        className="opacity-80 hover:opacity-100 transition-opacity cursor-crosshair"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className="opacity-80 hover:opacity-100 transition-opacity cursor-crosshair"
      />

      {/* Circular Node Body: Fill strictly contained inside, no outer glow/overflow */}
      <div
        className={`w-full h-full rounded-full flex items-center justify-center text-center p-2.5 transition-all duration-150 overflow-hidden ${
          selected
            ? 'border-2 border-white ring-2 ring-white/30'
            : 'border border-white/20 hover:border-white/60'
        }`}
        style={{
          backgroundColor: color
        }}
      >
        <span className="text-[11px] font-semibold text-white tracking-tight leading-tight line-clamp-3 select-none break-words drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {name}
        </span>
      </div>
    </div>
  );
});

CustomNode.displayName = 'CustomNode';
