import React, { useEffect } from 'react';
import { useGraphStore } from './store/graphStore';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { GraphCanvas } from './components/GraphCanvas';
import { DetailsPanel } from './components/DetailsPanel';

export const App: React.FC = () => {
  const { loadNodeTypes, loadGraph } = useGraphStore();

  useEffect(() => {
    // Initialize node types and graph from mock backend
    loadNodeTypes();
    loadGraph();
  }, [loadNodeTypes, loadGraph]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#070a13] text-slate-100">
      {/* Top Application Header */}
      <Header />

      {/* Main 3-Panel Workspace: Minimal Sidebar, Focus Graph, Inspector Panel */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Minimal Left Sidebar (Colored Dots + Category Names) */}
        <Sidebar />

        {/* Center Canvas (Obsidian Graph View, Zoom-Based Labels) */}
        <main className="flex-1 relative overflow-hidden">
          <GraphCanvas />
        </main>

        {/* Right Inspector Panel (Single Source of Truth, No Popups) */}
        <DetailsPanel />
      </div>
    </div>
  );
};

export default App;
