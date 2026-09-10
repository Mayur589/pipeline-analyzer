import React from 'react';
import { useGraphStore } from '../store/graphStore';
import { Layers } from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { nodeCategories, nodes } = useGraphStore();

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, categoryId: string) => {
    e.dataTransfer.setData('application/pipelineguard-node', categoryId);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="w-[220px] shrink-0 bg-[#0B1220]/70 backdrop-blur-md border-r border-white/5 flex flex-col select-none z-20">
      {/* Header showing Color : Category Table */}
      <div className="px-3.5 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-semibold text-slate-200 tracking-tight">Color : Category</span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">Drag to add</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {nodeCategories.map((cat) => {
          const count = nodes.filter((n) => n.categoryId === cat.id).length;
          return (
            <div
              key={cat.id}
              draggable
              onDragStart={(e) => handleDragStart(e, cat.id)}
              className="group flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-grab active:cursor-grabbing transition-colors duration-150"
              title={`Drag to canvas to add ${cat.category} node`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {/* Unique Color Dot with subtle glow */}
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform group-hover:scale-125"
                  style={{
                    backgroundColor: cat.color || '#06b6d4',
                    boxShadow: `0 0 6px ${cat.color || '#06b6d4'}80`
                  }}
                />

                {/* Category Name */}
                <span className="text-xs text-slate-300 group-hover:text-slate-100 truncate transition-colors font-medium">
                  {cat.category}
                </span>
              </div>

              {/* Count only, no color hex code */}
              {count > 0 && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400 shrink-0">
                  {count}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
