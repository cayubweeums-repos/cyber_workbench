import React, { useState } from 'react';
import Canvas from './components/Canvas/Canvas';
import NodeLibrary from './components/NodeLibrary/NodeLibrary';
import NodeEditor from './components/NodeEditor/NodeEditor';
import EnvironmentView from './components/EnvironmentView/EnvironmentView';
import NodeViewer from './components/NodeViewer/NodeViewer';
import useCanvasStore from './stores/canvasStore';
import useEnvironmentStore from './stores/environmentStore';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState('environments');
  const [viewingNode, setViewingNode] = useState(null);
  const { nodes, edges, selectedNode, clearCanvas } = useCanvasStore();
  const { createEnvironment } = useEnvironmentStore();
  
  const handleSaveEnvironment = async () => {
    const envName = prompt('Enter environment name:');
    if (!envName) return;
    
    const envId = `env-${Date.now()}`;
    const envData = {
      id: envId,
      name: envName,
      nodes: nodes.map(node => ({
        id: node.id,
        type: node.data.type,
        name: node.data.name,
        config: node.data.config,
        position: node.position,
        connections: edges
          .filter(e => e.source === node.id)
          .map(e => e.target)
      })),
      networks: []
    };
    
    try {
      await createEnvironment(envData);
      alert('Environment saved successfully!');
      clearCanvas();
      setCurrentView('environments');
    } catch (error) {
      alert(`Failed to save environment: ${error.message}`);
    }
  };
  
  const handleNodeDoubleClick = (node) => {
    setViewingNode(node.data);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Cyber Workbench</h1>
        <nav>
          <button 
            onClick={() => setCurrentView('environments')}
            className={currentView === 'environments' ? 'active' : ''}
          >
            Environments
          </button>
          <button 
            onClick={() => setCurrentView('builder')}
            className={currentView === 'builder' ? 'active' : ''}
          >
            Visual Builder
          </button>
        </nav>
        {currentView === 'builder' && (
          <button onClick={handleSaveEnvironment} className="btn-save">
            Save Environment
          </button>
        )}
      </header>
      
      <main className="app-main">
        {currentView === 'environments' ? (
          <EnvironmentView onOpenBuilder={() => setCurrentView('builder')} />
        ) : (
          <div className="builder-layout">
            <aside className="node-library-sidebar">
              <NodeLibrary />
            </aside>
            <div className="canvas-container">
              <Canvas onNodeDoubleClick={handleNodeDoubleClick} />
            </div>
            {selectedNode && (
              <aside className="node-editor-sidebar">
                <NodeEditor />
                <button 
                  onClick={() => handleNodeDoubleClick({ data: selectedNode })}
                  className="btn-view-node"
                >
                  View Node
                </button>
              </aside>
            )}
          </div>
        )}
      </main>
      
      {viewingNode && (
        <NodeViewer 
          node={viewingNode} 
          onClose={() => setViewingNode(null)} 
        />
      )}
    </div>
  );
}

export default App;

