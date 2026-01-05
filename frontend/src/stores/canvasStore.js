import { create } from 'zustand';

const useCanvasStore = create((set, get) => ({
  nodes: [],
  edges: [],
  selectedNode: null,
  
  // Add a node to the canvas
  addNode: (node) => {
    set(state => ({
      nodes: [...state.nodes, {
        id: node.id,
        type: node.type,
        position: node.position || { x: 100, y: 100 },
        data: node
      }]
    }));
  },
  
  // Update a node
  updateNode: (nodeId, updates) => {
    set(state => ({
      nodes: state.nodes.map(node =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...updates } } : node
      )
    }));
  },
  
  // Remove a node
  removeNode: (nodeId) => {
    set(state => ({
      nodes: state.nodes.filter(node => node.id !== nodeId),
      edges: state.edges.filter(edge => 
        edge.source !== nodeId && edge.target !== nodeId
      ),
      selectedNode: state.selectedNode?.id === nodeId ? null : state.selectedNode
    }));
  },
  
  // Add an edge (connection between nodes)
  addEdge: (source, target) => {
    const edgeId = `${source}-${target}`;
    set(state => {
      // Check if edge already exists
      if (state.edges.some(e => e.id === edgeId)) {
        return state;
      }
      return {
        edges: [...state.edges, {
          id: edgeId,
          source,
          target,
          type: 'smoothstep'
        }]
      };
    });
  },
  
  // Remove an edge
  removeEdge: (edgeId) => {
    set(state => ({
      edges: state.edges.filter(edge => edge.id !== edgeId)
    }));
  },
  
  // Set selected node
  setSelectedNode: (node) => {
    set({ selectedNode: node });
  },
  
  // Clear selected node
  clearSelectedNode: () => {
    set({ selectedNode: null });
  },
  
  // Update node position
  updateNodePosition: (nodeId, position) => {
    set(state => ({
      nodes: state.nodes.map(node =>
        node.id === nodeId ? { ...node, position } : node
      )
    }));
  },
  
  // Clear canvas
  clearCanvas: () => {
    set({ nodes: [], edges: [], selectedNode: null });
  },
  
  // Load environment into canvas
  loadEnvironment: (environment) => {
    if (!environment || !environment.nodes) return;
    
    const nodes = environment.nodes.map((node, index) => ({
      id: node.id,
      type: node.type,
      position: node.position || { x: 100 + (index % 5) * 200, y: 100 + Math.floor(index / 5) * 150 },
      data: node
    }));
    
    // Create edges from connections
    const edges = [];
    environment.nodes.forEach(node => {
      if (node.connections) {
        node.connections.forEach(targetId => {
          edges.push({
            id: `${node.id}-${targetId}`,
            source: node.id,
            target: targetId,
            type: 'smoothstep'
          });
        });
      }
    });
    
    set({ nodes, edges, selectedNode: null });
  }
}));

export default useCanvasStore;

