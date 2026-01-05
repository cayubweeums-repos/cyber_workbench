import React, { useState, useEffect } from 'react';
import useCanvasStore from '../../stores/canvasStore';
import './NodeEditor.css';

function NodeEditor() {
  const { selectedNode, updateNode } = useCanvasStore();
  const [config, setConfig] = useState({});
  
  useEffect(() => {
    if (selectedNode) {
      setConfig(selectedNode.config || {});
    }
  }, [selectedNode]);
  
  if (!selectedNode) {
    return (
      <div className="node-editor">
        <div className="node-editor-empty">No node selected</div>
      </div>
    );
  }
  
  const handleConfigChange = (key, value) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    updateNode(selectedNode.id, { config: newConfig });
  };
  
  return (
    <div className="node-editor">
      <div className="node-editor-header">
        <h3>{selectedNode.name}</h3>
        <div className="node-editor-type">{selectedNode.type}</div>
      </div>
      
      <div className="node-editor-content">
        {selectedNode.type === 'vm' && (
          <>
            <div className="node-editor-field">
              <label>Version</label>
              <select
                value={config.version || '11'}
                onChange={(e) => handleConfigChange('version', e.target.value)}
              >
                <option value="7">Windows 7</option>
                <option value="8">Windows 8.1</option>
                <option value="10">Windows 10</option>
                <option value="11">Windows 11</option>
              </select>
            </div>
            <div className="node-editor-field">
              <label>RAM</label>
              <select
                value={config.ram || '8G'}
                onChange={(e) => handleConfigChange('ram', e.target.value)}
              >
                <option value="2G">2 GB</option>
                <option value="4G">4 GB</option>
                <option value="8G">8 GB</option>
                <option value="16G">16 GB</option>
                <option value="32G">32 GB</option>
              </select>
            </div>
            <div className="node-editor-field">
              <label>CPU Cores</label>
              <input
                type="number"
                value={config.cpu || '4'}
                onChange={(e) => handleConfigChange('cpu', parseInt(e.target.value))}
                min="1"
                max="16"
              />
            </div>
            <div className="node-editor-field">
              <label>Username</label>
              <input
                type="text"
                value={config.username || 'user'}
                onChange={(e) => handleConfigChange('username', e.target.value)}
              />
            </div>
            <div className="node-editor-field">
              <label>Password</label>
              <input
                type="password"
                value={config.password || 'password'}
                onChange={(e) => handleConfigChange('password', e.target.value)}
              />
            </div>
          </>
        )}
        
        {(selectedNode.type === 'container' || selectedNode.type === 'service') && (
          <>
            <div className="node-editor-field">
              <label>Image</label>
              <input
                type="text"
                value={config.image || ''}
                onChange={(e) => handleConfigChange('image', e.target.value)}
                placeholder="docker.io/image:tag"
              />
            </div>
            <div className="node-editor-field">
              <label>Command</label>
              <input
                type="text"
                value={config.command || ''}
                onChange={(e) => handleConfigChange('command', e.target.value)}
                placeholder="Optional command"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default NodeEditor;

