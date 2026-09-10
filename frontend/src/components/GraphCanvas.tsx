import React, { useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  BackgroundVariant
} from '@xyflow/react';
import type {
  Connection,
  Edge as FlowEdge,
  Node as FlowNode
} from '@xyflow/react';
import { useGraphStore } from '../store/graphStore';
import { CustomNode } from './CustomNode';
import { CustomEdge } from './CustomEdge';
import { Shield, PlusCircle } from 'lucide-react';

const nodeTypes = {
  pipelineNode: CustomNode
};

const edgeTypes = {
  pipelineEdge: CustomEdge
};

const CanvasInner: React.FC = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const {
    nodes,
    edges,
    selectedNodeId,
    selectNode,
    updateNodePosition,
    openNodeDialog,
    openEdgeDialog,
    nodeCategories
  } = useGraphStore();

  // Convert store nodes to React Flow nodes
  const flowNodes: FlowNode[] = useMemo(() => {
    return nodes.map((node) => ({
      id: node.id,
      type: 'pipelineNode',
      position: node.position || { x: 250, y: 200 },
      data: {
        categoryId: node.categoryId,
        properties: node.properties
      },
      selected: node.id === selectedNodeId
    }));
  }, [nodes, selectedNodeId]);

  // Convert store edges to React Flow edges
  const flowEdges: FlowEdge[] = useMemo(() => {
    return edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      type: 'pipelineEdge',
      data: {
        relationship: edge.relationship
      }
    }));
  }, [edges]);

  // Handle Drag Over
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle Drop onto Canvas
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const categoryId = event.dataTransfer.getData('application/pipelineguard-node');
      if (!categoryId) return;

      // Project screen coordinates to React Flow coordinates
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });

      // Open node configuration dialog instead of immediately creating node
      openNodeDialog({
        categoryId,
        position
      });
    },
    [screenToFlowPosition, openNodeDialog]
  );

  // Handle connecting two nodes
  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target && connection.source !== connection.target) {
        // Open edge relationship dialog
        openEdgeDialog({
          sourceNodeId: connection.source,
          targetNodeId: connection.target
        });
      }
    },
    [openEdgeDialog]
  );

  // Handle node drag stop to persist new coordinate
  const onNodeDragStop = useCallback(
    (_event: any, node: FlowNode) => {
      updateNodePosition(node.id, node.position);
    },
    [updateNodePosition]
  );

  // Handle node click
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: FlowNode) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  // Handle canvas pane click to deselect
  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  return (
    <div className="relative flex-1 h-full w-full bg-[#070a13]" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitViewOptions={{ padding: 0.2 }}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.5}
          color="#1e293b"
        />

        <Controls
          showInteractive={false}
          className="!bottom-4 !left-4"
        />

        <MiniMap
          nodeStrokeColor="#06b6d4"
          nodeColor={(n) => {
            const cat = nodeCategories.find((c) => c.id === n.data?.categoryId);
            return cat?.color || '#334155';
          }}
          maskColor="rgba(7, 10, 19, 0.75)"
          className="!bottom-4 !right-4"
          zoomable
          pannable
        />
      </ReactFlow>

      {/* Empty Canvas Placeholder */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
          <div className="max-w-md p-8 rounded-2xl bg-[#0b1120]/80 backdrop-blur-md border border-dashed border-slate-700/80 text-center shadow-2xl space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400">
              <Shield className="w-7 h-7 animate-pulse-subtle" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Software Supply Chain Visualizer
              </h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Drag a node from the sidebar to begin building your pipeline.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2 text-[11px] text-cyan-400 font-mono">
              <PlusCircle className="w-3.5 h-3.5" />
              <span>10 categories ready for threat modeling</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const GraphCanvas: React.FC = () => {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
};
