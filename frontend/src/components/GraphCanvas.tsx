import React, { useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
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
    selectedEdgeId,
    selectNode,
    selectEdge,
    clearSelection,
    updateNodePosition,
    addNode,
    addEdge,
    nodeCategories
  } = useGraphStore();

  // Convert store nodes to React Flow nodes
  const flowNodes: FlowNode[] = useMemo(() => {
    return nodes.map((node) => ({
      id: node.id,
      type: 'pipelineNode',
      position: node.position || { x: 300, y: 300 },
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
      },
      selected: edge.id === selectedEdgeId
    }));
  }, [edges, selectedEdgeId]);

  // Drag over canvas
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Drop onto canvas -> IMMEDIATELY create node, select it, NO popup!
  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();

      const categoryId = event.dataTransfer.getData('application/pipelineguard-node');
      if (!categoryId) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
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

      // Immediately insert node through mock API and select it
      await addNode({
        categoryId,
        properties: defaultProperties,
        position
      });
    },
    [screenToFlowPosition, nodeCategories, addNode]
  );

  // Connecting handles -> IMMEDIATELY create edge, select it, NO popup!
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

  // Drag stop -> persist node coordinate
  const onNodeDragStop = useCallback(
    (_event: any, node: FlowNode) => {
      updateNodePosition(node.id, node.position);
    },
    [updateNodePosition]
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
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        fitViewOptions={{ padding: 0.3 }}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.1}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
      >
        {/* Subtle Obsidian Dotted Background */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="rgba(148, 163, 184, 0.12)"
        />

        {/* Minimal Controls */}
        <Controls
          showInteractive={false}
          className="!bottom-4 !left-4 opacity-70 hover:opacity-100 transition-opacity"
        />
      </ReactFlow>

      {/* Minimal Empty State */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6 select-none">
          <div className="text-center space-y-1.5 opacity-60">
            <p className="text-sm font-medium text-slate-400">
              Drag a node from the sidebar to begin building your pipeline.
            </p>
            <p className="text-xs text-slate-600 font-mono">
              Obsidian Graph View Mode
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
