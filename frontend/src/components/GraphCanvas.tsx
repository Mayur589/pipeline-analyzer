import React, { useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useReactFlow,
  ReactFlowProvider,
  BackgroundVariant,
  useNodesState,
  useEdgesState
} from '@xyflow/react';
import type {
  Connection,
  Edge as FlowEdge,
  Node as FlowNode,
  NodeChange
} from '@xyflow/react';
import { useGraphStore } from '../store/graphStore';
import { CustomNode } from './CustomNode';
import { CustomEdge } from './CustomEdge';

const nodeTypes = {
  pipelineNode: CustomNode
};

const edgeTypes = {
  pipelineEdge: CustomEdge
};

const CanvasInner: React.FC = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const isDraggingRef = useRef(false);

  const {
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    selectNode,
    selectEdge,
    clearSelection,
    updateNodePosition,
    addNode,
    addEdge,
    nodeCategories
  } = useGraphStore();

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);

  // Synchronize store nodes into local React Flow state
  useEffect(() => {
    if (isDraggingRef.current) return;

    setFlowNodes(
      nodes.map((node) => ({
        id: node.id,
        type: 'pipelineNode',
        position: node.position || { x: 300, y: 300 },
        data: {
          categoryId: node.categoryId,
          properties: node.properties
        },
        selected: node.id === selectedNodeId
      }))
    );
  }, [nodes, selectedNodeId, setFlowNodes]);

  // Synchronize store edges into local React Flow state
  useEffect(() => {
    setFlowEdges(
      edges.map((edge) => ({
        id: edge.id,
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
        type: 'pipelineEdge',
        data: {
          relationship: edge.relationship
        },
        selected: edge.id === selectedEdgeId
      }))
    );
  }, [edges, selectedEdgeId, setFlowEdges]);

  // Real-time live dragging handler
  const handleNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      onNodesChange(changes);
    },
    [onNodesChange]
  );

  const onNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const onNodeDragStop = useCallback(
    (_event: any, node: FlowNode) => {
      isDraggingRef.current = false;
      updateNodePosition(node.id, node.position);
    },
    [updateNodePosition]
  );

  // Drag over canvas
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Drop onto canvas -> IMMEDIATELY create node, select it, NO popup
  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();

      const categoryId = event.dataTransfer.getData('application/pipelineguard-node');
      if (!categoryId) return;

      const position = screenToFlowPosition({
        x: event.clientX - 34,
        y: event.clientY - 34
      });

      const category = nodeCategories.find((c) => c.id === categoryId);

      // Generate default properties automatically
      const defaultProperties: Record<string, any> = {};
      if (category) {
        category.defaultProperties.forEach((propKey) => {
          const fieldDef = category.fieldDefs?.find((f) => f.key === propKey);
          if (fieldDef?.defaultValue !== undefined) {
            defaultProperties[propKey] = fieldDef.defaultValue;
          } else if (propKey === 'name') {
            defaultProperties[propKey] = category.category;
          } else if (
            propKey.toLowerCase().includes('protection') ||
            propKey.toLowerCase().includes('enabled') ||
            propKey.toLowerCase().includes('required') ||
            propKey.toLowerCase().includes('scanning') ||
            propKey.toLowerCase().includes('ephemeral') ||
            propKey.toLowerCase().includes('zerotrust') ||
            propKey.toLowerCase().includes('immutable')
          ) {
            defaultProperties[propKey] = true;
          } else {
            defaultProperties[propKey] = '';
          }
        });
      }

      await addNode({
        categoryId,
        properties: defaultProperties,
        position
      });
    },
    [screenToFlowPosition, nodeCategories, addNode]
  );

  // Connecting handles -> IMMEDIATELY create edge, select it
  const onConnect = useCallback(
    async (connection: Connection) => {
      if (connection.source && connection.target && connection.source !== connection.target) {
        await addEdge({
          sourceNodeId: connection.source,
          targetNodeId: connection.target,
          relationship: 'relates to'
        });
      }
    },
    [addEdge]
  );

  // Node click -> select node
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: FlowNode) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  // Edge click -> select edge
  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: FlowEdge) => {
      selectEdge(edge.id);
    },
    [selectEdge]
  );

  // Canvas pane click -> clear selection
  const onPaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  return (
    <div className="relative flex-1 h-full w-full bg-[#0B1220]" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        fitViewOptions={{ padding: 0.25 }}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.1}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
      >
        {/* Subtle Charcoal background with faint low-opacity dots */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="rgba(255, 255, 255, 0.04)"
        />

        {/* Quiet Minimal Controls */}
        <Controls
          showInteractive={false}
          className="!bottom-4 !left-4 opacity-40 hover:opacity-90 transition-opacity"
        />
      </ReactFlow>

      {/* Clean Obsidian-Style Empty State */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6 select-none">
          <div className="text-center space-y-2 max-w-sm">
            <h2 className="text-base font-medium text-slate-200 tracking-tight">
              Build your software supply chain
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed font-normal">
              Drag a category from the left sidebar to create your first node.
            </p>
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
