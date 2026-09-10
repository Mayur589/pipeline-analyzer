import React, { useEffect } from 'react';
import { useGraphStore } from './store/graphStore';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Prj1GraphCanvas } from './components/Prj1GraphCanvas';
import { DetailsPanel } from './components/DetailsPanel';

export const App: React.FC = () => {
  const { loadNodeTypes, loadGraph } = useGraphStore();

  useEffect(() => {
    // Initialize node types and graph from mock backend
    loadNodeTypes();
    loadGraph();
  }, [loadNodeTypes, loadGraph]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0B1220] text-slate-100">
      {/* Clean 56px Top Bar */}
      <Header />

      {/* Main Graph-First Workspace */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Minimal 190px Sidebar */}
        <Sidebar />

        {/* 60 FPS Canvas Graph Engine from prj1_graph */}
        <main className="flex-1 relative overflow-hidden">
          <Prj1GraphCanvas />
        </main>

        {/* Floating 300px Inspector */}
        <DetailsPanel />
      </div>
    </div>
  );
};

export default App;
