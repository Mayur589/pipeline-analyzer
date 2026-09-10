import React, { useState } from 'react';
import { useGraphStore } from '../store/graphStore';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { nodeCategories, isSidebarCollapsed, toggleSidebar } = useGraphStore();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCategories = nodeCategories.filter((c) =>
    c.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, categoryId: string) => {
    e.dataTransfer.setData('application/pipelineguard-node', categoryId);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside
      className={`relative flex flex-col bg-[#080d19] border-r border-slate-900 transition-all duration-300 ease-in-out z-20 select-none ${
        isSidebarCollapsed ? 'w-12' : 'w-60'
      }`}
    >
      {/* Minimal Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-900">
        {!isSidebarCollapsed && (
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Node Types
          </span>
        )}
        <button
          onClick={toggleSidebar}
          title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors mx-auto"
        >
          {isSidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Filter search if expanded */}
      {!isSidebarCollapsed && (
        <div className="px-3 pt-2 pb-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3 h-3 text-slate-500" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-7 pr-2 py-1 text-xs bg-slate-900/60 border border-slate-800/80 rounded text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-700 transition-all"
            />
          </div>
        </div>
      )}

      {/* Minimal Categories List: Only Colored Dot + Category Name */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 custom-scrollbar">
        {filteredCategories.map((cat) => {
          return (
            <div
              key={cat.id}
              draggable
              onDragStart={(e) => handleDragStart(e, cat.id)}
              className="group flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-slate-800/50 cursor-grab active:cursor-grabbing transition-colors duration-150"
              title={cat.category}
            >
              {/* Colored Dot */}
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform group-hover:scale-125"
                style={{
                  backgroundColor: cat.color || '#06b6d4',
                  boxShadow: `0 0 6px ${cat.color}66`
                }}
              />

              {/* Category Name */}
              {!isSidebarCollapsed && (
                <span className="text-xs text-slate-300 group-hover:text-white truncate transition-colors">
                  {cat.category}
                </span>
              )}
            </div>
          );
        })}

        {filteredCategories.length === 0 && !isSidebarCollapsed && (
          <div className="p-3 text-center text-xs text-slate-600">
            No matches
          </div>
        )}
      </div>
    </aside>
  );
};
