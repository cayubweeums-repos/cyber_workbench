import React, { useState } from 'react';
import useCanvasStore from '../../stores/canvasStore';
import './NodeLibrary.css';

const NODE_TYPES = [
  {
    id: 'vm-windows11',
    type: 'vm',
    name: 'Windows 11 VM',
    description: 'Windows 11 virtual machine',
    icon: '🖥️',
    category: 'VMs',
    defaultConfig: {
      version: '11',
      ram: '8G',
      cpu: '4',
      username: 'user',
      password: 'password'
    }
  },
  {
    id: 'vm-windows10',
    type: 'vm',
    name: 'Windows 10 VM',
    description: 'Windows 10 virtual machine',
    icon: '🖥️',
    category: 'VMs',
    defaultConfig: {
      version: '10',
      ram: '8G',
      cpu: '4',
      username: 'user',
      password: 'password'
    }
  },
  {
    id: 'container-splunk',
    type: 'service',
    name: 'Splunk',
    description: 'Splunk Enterprise',
    icon: '📊',
    category: 'Services',
    defaultConfig: {
      image: 'splunk/splunk:latest',
      env: {
        SPLUNK_START_ARGS: '--accept-license',
        SPLUNK_PASSWORD: 'password'
      },
      ports: [{ host: 8000, container: 8000 }]
    }
  },
  {
    id: 'container-caldera',
    type: 'service',
    name: 'Caldera',
    description: 'MITRE Caldera',
    icon: '🎯',
    category: 'Services',
    defaultConfig: {
      image: 'caldera:latest',
      ports: [{ host: 8888, container: 8888 }],
      command: '--fresh --insecure'
    }
  },
  {
    id: 'container-generic',
    type: 'container',
    name: 'Generic Container',
    description: 'Custom Docker container',
    icon: '📦',
    category: 'Containers',
    defaultConfig: {
      image: '',
      env: {},
      ports: []
    }
  }
];

function NodeLibrary() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const { addNode } = useCanvasStore();
  
  const categories = ['all', ...new Set(NODE_TYPES.map(n => n.category))];
  
  const filteredNodes = NODE_TYPES.filter(node => {
    const matchesSearch = node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         node.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || node.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
  
  const handleDragStart = (e, nodeType) => {
    e.dataTransfer.setData('application/reactflow', JSON.stringify(nodeType));
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const handleNodeClick = (nodeType) => {
    const nodeId = `${nodeType.type}-${Date.now()}`;
    addNode({
      id: nodeId,
      type: nodeType.type,
      name: nodeType.name,
      config: { ...nodeType.defaultConfig },
      position: { x: 100, y: 100 }
    });
  };
  
  return (
    <div className="node-library">
      <div className="node-library-header">
        <h2>Node Library</h2>
        <input
          type="text"
          placeholder="Search nodes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="node-library-search"
        />
      </div>
      
      <div className="node-library-categories">
        {categories.map(category => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={selectedCategory === category ? 'active' : ''}
          >
            {category}
          </button>
        ))}
      </div>
      
      <div className="node-library-list">
        {filteredNodes.map(nodeType => (
          <div
            key={nodeType.id}
            className="node-library-item"
            draggable
            onDragStart={(e) => handleDragStart(e, nodeType)}
            onClick={() => handleNodeClick(nodeType)}
          >
            <span className="node-library-icon">{nodeType.icon}</span>
            <div className="node-library-item-content">
              <div className="node-library-item-name">{nodeType.name}</div>
              <div className="node-library-item-desc">{nodeType.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default NodeLibrary;

