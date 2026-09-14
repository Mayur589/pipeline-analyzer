import React, { useState } from 'react';
import { useGraphStore } from '../store/graphStore';
import { Layers, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { nodeCategories, nodes, appMode } = useGraphStore();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, categoryId: string) => {
    if (appMode === 'attack') {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('application/pipelineguard-node', categoryId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const isEdit = appMode === 'edit';

  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        className="absolute top-3.5 left-3.5 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0F172A]/90 hover:bg-[#1E293B]/90 backdrop-blur-md border border-white/10 hover:border-cyan-500/40 text-slate-300 hover:text-white shadow-2xl transition-all cursor-pointer text-xs group animate-fade-in"
        title="Expand Categories Sidebar"
      >
        <PanelLeftOpen className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
        <span className="font-semibold text-[11px] tracking-tight">Categories</span>
      </button>
    );
  }

  return (
    <aside className="w-[220px] shrink-0 bg-[#0B1220]/70 backdrop-blur-md border-r border-white/5 flex flex-col select-none z-20 transition-all duration-300 ease-in-out">
      {/* Header showing Color : Category Table */}
      <div className="px-3.5 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-semibold text-slate-200 tracking-tight">Color : Category</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-mono ${isEdit ? 'text-slate-500' : 'text-rose-400 font-medium'}`}>
            {isEdit ? 'Drag' : 'Attack'}
          </span>
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Collapse Sidebar"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {nodeCategories.map((cat) => {
          const count = nodes.filter((n) => n.categoryId === cat.id).length;
          return (
            <div
              key={cat.id}
              draggable={isEdit}
              onDragStart={(e) => handleDragStart(e, cat.id)}
              className={`group flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors duration-150 ${
                isEdit
                  ? 'hover:bg-white/5 cursor-grab active:cursor-grabbing'
                  : 'opacity-75 cursor-not-allowed'
              }`}
              title={
                isEdit
                  ? `Drag to canvas to add ${cat.category} node`
                  : `Editing disabled in Attack Mode`
              }
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

              {/* Count only */}
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
