import React, { useCallback, useRef } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import useCanvasStore from '../../stores/canvasStore';
import CustomNode from './CustomNode';

const nodeTypes = {
  custom: CustomNode
};

function CanvasInner() {
  const reactFlowWrapper = useRef(null);
  const { nodes: storeNodes, edges: storeEdges, setSelectedNode, clearSelectedNode, addNode } = useCanvasStore();
  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);
  
  // Sync store with local state
  React.useEffect(() => {
    setNodes(storeNodes);
  }, [storeNodes, setNodes]);
  
  React.useEffect(() => {
    setEdges(storeEdges);
  }, [storeEdges, setEdges]);
  
  const onConnect = useCallback(
    (params) => {
      const newEdges = addEdge(params, edges);
      setEdges(newEdges);
      useCanvasStore.getState().addEdge(params.source, params.target);
    },
    [edges, setEdges]
  );
  
  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node.data);
  }, [setSelectedNode]);
  
  const onPaneClick = useCallback(() => {
    clearSelectedNode();
  }, [clearSelectedNode]);
  
  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);
  
  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      
      if (!reactFlowWrapper.current) return;
      
      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const nodeTypeData = event.dataTransfer.getData('application/reactflow');
      
      if (!nodeTypeData) {
        return;
      }
      
      const nodeType = JSON.parse(nodeTypeData);
      const position = {
        x: event.clientX - reactFlowBounds.left - 100,
        y: event.clientY - reactFlowBounds.top - 50,
      };
      
      const nodeId = `${nodeType.type}-${Date.now()}`;
      const newNode = {
        id: nodeId,
        type: nodeType.type,
        name: nodeType.name,
        config: { ...nodeType.defaultConfig },
        position
      };
      
      addNode(newNode);
    },
    [addNode]
  );
  
  return (
    <div ref={reactFlowWrapper} style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}

function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

export default Canvas;

