import React, { useEffect, useState } from 'react';
import { nodeAPI } from '../../services/api';
import './NodeViewer.css';

function NodeViewer({ node, onClose }) {
  const [viewers, setViewers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (node && node.type === 'vm' && node.containerName) {
      loadViewers();
    }
  }, [node]);
  
  const loadViewers = async () => {
    if (!node.containerName) return;
    try {
      setLoading(true);
      const response = await nodeAPI.getViewers(node.containerName);
      setViewers(response.data.viewers || []);
    } catch (error) {
      console.error('Failed to load viewers:', error);
    } finally {
      setLoading(false);
    }
  };
  
  if (!node) {
    return null;
  }
  
  if (node.type === 'vm') {
    return (
      <div className="node-viewer">
        <div className="node-viewer-header">
          <h2>{node.name}</h2>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="node-viewer-content">
          {loading ? (
            <div className="node-viewer-loading">Loading viewer...</div>
          ) : viewers.length > 0 ? (
            viewers.map((viewer, index) => (
              <div key={index} className="node-viewer-frame-container">
                {viewer.type === 'novnc' && (
                  <iframe
                    src={viewer.url}
                    className="node-viewer-frame"
                    allow="clipboard-read; clipboard-write"
                  />
                )}
                {viewer.type === 'guac' && (
                  <iframe
                    src={viewer.url}
                    className="node-viewer-frame"
                    allow="clipboard-read; clipboard-write"
                  />
                )}
              </div>
            ))
          ) : (
            <div className="node-viewer-error">
              No viewer available. The VM may still be starting up.
            </div>
          )}
        </div>
      </div>
    );
  }
  
  if (node.type === 'service' || node.type === 'container') {
    const serviceUrl = node.config?.ports?.[0] 
      ? `http://localhost:${node.config.ports[0].host}`
      : null;
    
    return (
      <div className="node-viewer">
        <div className="node-viewer-header">
          <h2>{node.name}</h2>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="node-viewer-content">
          {serviceUrl ? (
            <iframe
              src={serviceUrl}
              className="node-viewer-frame"
            />
          ) : (
            <div className="node-viewer-error">
              No service URL available. Check node configuration.
            </div>
          )}
        </div>
      </div>
    );
  }
  
  return (
    <div className="node-viewer">
      <div className="node-viewer-header">
        <h2>{node.name}</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="node-viewer-content">
        <div className="node-viewer-info">
          <p>Node type: {node.type}</p>
          <p>No viewer available for this node type.</p>
        </div>
      </div>
    </div>
  );
}

export default NodeViewer;

