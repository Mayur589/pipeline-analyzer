import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath
} from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { useGraphStore } from '../store/graphStore';
import { X, ArrowRight } from 'lucide-react';

export const CustomEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
  selected
}) => {
  const { removeEdge } = useGraphStore();
  const relationship = (data?.relationship as string) || 'connects to';

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  });

  const onEdgeClick = (evt: React.MouseEvent) => {
    evt.stopPropagation();
    removeEdge(id);
  };

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? '#06b6d4' : '#334155',
          strokeWidth: selected ? 2.5 : 1.8,
          strokeDasharray: selected ? '4 2' : undefined,
          ...style
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all'
          }}
          className="nodrag nopan group"
        >
          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono transition-all duration-200 shadow-md ${
              selected
                ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/80 shadow-cyan-500/20'
                : 'bg-slate-900/90 text-slate-300 border border-slate-700/80 hover:border-cyan-500/50 hover:text-cyan-200'
            }`}
          >
            <ArrowRight className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
            <span className="truncate max-w-[130px] font-medium tracking-tight">
              {relationship}
            </span>
            <button
              onClick={onEdgeClick}
              title="Delete Relationship"
              className="ml-0.5 p-0.5 rounded-full hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};
