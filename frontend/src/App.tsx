import React, { useEffect } from 'react';
import { useGraphStore } from './store/graphStore';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { GraphCanvas } from './components/GraphCanvas';
import { DetailsPanel } from './components/DetailsPanel';
import { NodeDialog } from './components/NodeDialog';
import { EdgeDialog } from './components/EdgeDialog';

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

      {/* Main 3-Panel Workspace */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar (Collapsible, 10 Draggable Categories) */}
        <Sidebar />

        {/* Center Canvas (React Flow with Drag & Drop, Controls, MiniMap) */}
        <main className="flex-1 relative overflow-hidden">
          <GraphCanvas />
        </main>

        {/* Right Panel (Fixed ~320px, Node Details, Properties, Connected Edges) */}
        <DetailsPanel />
      </div>

      {/* Dynamic Property Form Modal (Appears when category dropped on canvas) */}
      <NodeDialog />

      {/* Edge Relationship Modal (Appears when connecting two nodes) */}
      <EdgeDialog />
    </div>
  );
};

export default App;
