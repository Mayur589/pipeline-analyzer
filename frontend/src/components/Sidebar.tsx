import React from 'react';
import { useGraphStore } from '../store/graphStore';

export const Sidebar: React.FC = () => {
  const { nodeCategories } = useGraphStore();

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, categoryId: string) => {
    e.dataTransfer.setData('application/pipelineguard-node', categoryId);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="w-[190px] shrink-0 bg-[#0B1220]/70 backdrop-blur-md border-r border-white/5 flex flex-col select-none z-20">
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3.5 custom-scrollbar">
        {nodeCategories.map((cat) => {
          return (
            <div
              key={cat.id}
              draggable
              onDragStart={(e) => handleDragStart(e, cat.id)}
              className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-grab active:cursor-grabbing transition-colors duration-150"
            >
              {/* Colored Dot */}
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform group-hover:scale-110"
                style={{
                  backgroundColor: cat.color || '#06b6d4'
                }}
              />

              {/* Category Name */}
              <span className="text-xs text-slate-400 group-hover:text-slate-100 truncate transition-colors font-normal">
                {cat.category}
              </span>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
