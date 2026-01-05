import React from 'react';
import { Handle, Position } from 'reactflow';

function CustomNode({ data }) {
  const getNodeColor = (type) => {
    switch (type) {
      case 'vm':
        return '#0078d4';
      case 'container':
        return '#00a4ef';
      case 'service':
        return '#107c10';
      default:
        return '#666';
    }
  };
  
  const getNodeIcon = (type) => {
    switch (type) {
      case 'vm':
        return '🖥️';
      case 'container':
        return '📦';
      case 'service':
        return '⚙️';
      default:
        return '📄';
    }
  };
  
  return (
    <div
      style={{
        background: '#2a2a2a',
        border: `2px solid ${getNodeColor(data.type)}`,
        borderRadius: '8px',
        padding: '10px',
        minWidth: '150px',
        color: '#e0e0e0',
        cursor: 'pointer'
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '20px' }}>{getNodeIcon(data.type)}</span>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{data.name}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>{data.type}</div>
        </div>
      </div>
      {data.config?.image && (
        <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>
          {data.config.image}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default CustomNode;

