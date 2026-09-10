import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useViewport
} from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { useGraphStore } from '../store/graphStore';

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
  const { selectEdge, selectedEdgeId } = useGraphStore();
  const { zoom } = useViewport();
  const relationship = (data?.relationship as string) || 'connects to';

  const isEdgeSelected = selected || selectedEdgeId === id;
  const isLabelVisible = zoom >= 1.2;

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
    selectEdge(id);
  };

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        interactionWidth={16}
        style={{
          stroke: isEdgeSelected ? '#38bdf8' : 'rgba(100, 116, 139, 0.35)',
          strokeWidth: isEdgeSelected ? 2 : 1.2,
          filter: isEdgeSelected ? 'drop-shadow(0 0 4px rgba(56, 189, 248, 0.7))' : undefined,
          cursor: 'pointer',
          ...style
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: isLabelVisible ? 'all' : 'none',
            opacity: isLabelVisible ? 1 : 0,
            transition: 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          className="nodrag nopan select-none cursor-pointer"
          onClick={onEdgeClick}
        >
          <div
            className={`px-2 py-0.5 rounded text-[10px] font-mono tracking-tight transition-all duration-200 shadow-sm ${
              isEdgeSelected
                ? 'bg-sky-950/90 text-sky-300 border border-sky-500/80 shadow-sky-500/20'
                : 'bg-[#0b1120]/90 text-slate-400 border border-slate-800 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            {relationship}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};
