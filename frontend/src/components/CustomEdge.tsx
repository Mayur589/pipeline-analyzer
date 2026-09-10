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
          stroke: isEdgeSelected ? 'rgba(255, 255, 255, 0.75)' : 'rgba(148, 163, 184, 0.25)',
          strokeWidth: isEdgeSelected ? 1.5 : 1,
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
            transition: 'opacity 0.2s ease-in-out'
          }}
          className="nodrag nopan select-none cursor-pointer"
          onClick={onEdgeClick}
        >
          <div
            className={`px-2 py-0.5 rounded text-[10px] font-mono tracking-tight transition-colors duration-150 ${
              isEdgeSelected
                ? 'bg-[#151d2f] text-white border border-white/20'
                : 'bg-[#0B1220]/90 text-slate-400 border border-white/10 hover:text-slate-200'
            }`}
          >
            {relationship}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};
