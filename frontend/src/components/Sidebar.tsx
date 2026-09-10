import React, { useState } from 'react';
import { useGraphStore } from '../store/graphStore';
import { CategoryIcon } from './CategoryIcon';
import { Search, ChevronLeft, ChevronRight, Shield, GripVertical, Info } from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { nodeCategories, isSidebarCollapsed, toggleSidebar } = useGraphStore();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCategories = nodeCategories.filter(
    (c) =>
      c.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, categoryId: string) => {
    e.dataTransfer.setData('application/pipelineguard-node', categoryId);
    e.dataTransfer.effectAllowed = 'move';

    // Set custom drag preview if available
    const dragPreview = document.createElement('div');
    dragPreview.innerText = categoryId;
    dragPreview.style.position = 'absolute';
    dragPreview.style.top = '-1000px';
    document.body.appendChild(dragPreview);
    e.dataTransfer.setDragImage(dragPreview, 0, 0);
    setTimeout(() => document.body.removeChild(dragPreview), 0);
  };

  return (
    <aside
      className={`relative flex flex-col bg-[#0b1120] border-r border-slate-800/80 transition-all duration-300 ease-in-out z-20 select-none ${
        isSidebarCollapsed ? 'w-16' : 'w-80'
      }`}
    >
      {/* Sidebar Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800/80">
        {!isSidebarCollapsed ? (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-sm shadow-cyan-500/10">
              <Shield className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100 tracking-wide flex items-center gap-1.5">
                Pipeline Categories
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  {nodeCategories.length}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 truncate">Supply Chain Node Catalog</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Shield className="w-4 h-4" />
            </div>
          </div>
        )}

        {/* Collapse Toggle Button */}
        <button
          onClick={toggleSidebar}
          title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors border border-transparent hover:border-slate-700"
        >
          {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Search Input when expanded */}
      {!isSidebarCollapsed && (
        <div className="px-3 pt-3 pb-2 border-b border-slate-800/60">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filter categories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900/90 border border-slate-800 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/40 transition-all"
            />
          </div>
        </div>
      )}

      {/* Categories List */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-2.5 custom-scrollbar">
        {filteredCategories.map((cat, index) => {
          return (
            <div
              key={cat.id}
              draggable
              onDragStart={(e) => handleDragStart(e, cat.id)}
              className={`group relative rounded-lg border p-2.5 cursor-grab active:cursor-grabbing transition-all duration-200 shadow-sm ${
                cat.borderAccent || 'border-slate-800 hover:border-slate-700'
              } bg-slate-900/60 hover:bg-slate-850 hover:shadow-md hover:shadow-cyan-950/20`}
              title={isSidebarCollapsed ? cat.category : undefined}
            >
              {isSidebarCollapsed ? (
                <div className="flex flex-col items-center justify-center py-1">
                  <div
                    className="w-8 h-8 rounded-md flex items-center justify-center"
                    style={{ backgroundColor: `${cat.color}18`, color: cat.color }}
                  >
                    <CategoryIcon iconName={cat.iconName} className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 font-mono">#{index + 1}</span>
                </div>
              ) : (
                <div className="flex items-start gap-2.5">
                  {/* Drag Handle Icon */}
                  <div className="pt-1 text-slate-600 group-hover:text-slate-400 transition-colors">
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>

                  {/* Icon badge */}
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 border"
                    style={{
                      backgroundColor: `${cat.color}15`,
                      color: cat.color,
                      borderColor: `${cat.color}30`
                    }}
                  >
                    <CategoryIcon iconName={cat.iconName} className="w-4 h-4" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors truncate">
                        {cat.category}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1 py-0.2 rounded border border-slate-800">
                        {cat.defaultProperties.length} props
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                      {cat.description}
                    </p>

                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      {cat.defaultProperties.slice(0, 3).map((prop) => (
                        <span
                          key={prop}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-400 border border-slate-700/60 font-mono"
                        >
                          {prop}
                        </span>
                      ))}
                      {cat.defaultProperties.length > 3 && (
                        <span className="text-[9px] text-slate-400">
                          +{cat.defaultProperties.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredCategories.length === 0 && !isSidebarCollapsed && (
          <div className="p-4 text-center text-xs text-slate-400">
            No matching categories found
          </div>
        )}
      </div>

      {/* Footer Helper */}
      {!isSidebarCollapsed && (
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>Drag items to canvas to configure security nodes</span>
          </div>
        </div>
      )}
    </aside>
  );
};
