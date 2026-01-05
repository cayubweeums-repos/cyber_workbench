import React, { useEffect } from 'react';
import useEnvironmentStore from '../../stores/environmentStore';
import useCanvasStore from '../../stores/canvasStore';
import './EnvironmentView.css';

function EnvironmentView({ onOpenBuilder }) {
  const {
    environments,
    loading,
    error,
    loadEnvironments,
    startEnvironment,
    stopEnvironment,
    deleteEnvironment,
    refreshEnvironmentStatus
  } = useEnvironmentStore();
  const { loadEnvironment: loadCanvasEnvironment } = useCanvasStore();
  
  useEffect(() => {
    loadEnvironments();
    // Refresh status every 5 seconds
    const interval = setInterval(() => {
      environments.forEach(env => {
        if (env.status === 'running' || env.status === 'partial') {
          refreshEnvironmentStatus(env.id);
        }
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [environments.length]);
  
  const handleStart = async (envId) => {
    try {
      await startEnvironment(envId);
    } catch (err) {
      alert(`Failed to start environment: ${err.message}`);
    }
  };
  
  const handleStop = async (envId) => {
    try {
      await stopEnvironment(envId);
    } catch (err) {
      alert(`Failed to stop environment: ${err.message}`);
    }
  };
  
  const handleDelete = async (envId) => {
    if (!confirm('Are you sure you want to delete this environment?')) {
      return;
    }
    try {
      await deleteEnvironment(envId);
    } catch (err) {
      alert(`Failed to delete environment: ${err.message}`);
    }
  };
  
  const handleEdit = (env) => {
    loadCanvasEnvironment(env);
    onOpenBuilder();
  };
  
  const getStatusColor = (status) => {
    switch (status) {
      case 'running':
        return '#107c10';
      case 'stopped':
        return '#666';
      case 'starting':
      case 'stopping':
        return '#ffaa00';
      case 'partial':
        return '#ff6b00';
      default:
        return '#666';
    }
  };
  
  if (loading && environments.length === 0) {
    return <div className="environment-view-loading">Loading environments...</div>;
  }
  
  return (
    <div className="environment-view">
      <div className="environment-view-header">
        <h2>Environments</h2>
        <button onClick={onOpenBuilder} className="btn-primary">
          Create New Environment
        </button>
      </div>
      
      {error && (
        <div className="environment-view-error">
          Error: {error}
        </div>
      )}
      
      <div className="environment-list">
        {environments.length === 0 ? (
          <div className="environment-empty">
            <p>No environments yet. Create one to get started!</p>
            <button onClick={onOpenBuilder} className="btn-primary">
              Create Environment
            </button>
          </div>
        ) : (
          environments.map(env => (
            <div key={env.id} className="environment-card">
              <div className="environment-card-header">
                <h3>{env.name}</h3>
                <span
                  className="environment-status"
                  style={{ backgroundColor: getStatusColor(env.status) }}
                >
                  {env.status}
                </span>
              </div>
              
              <div className="environment-card-info">
                <div>Nodes: {env.nodes?.length || 0}</div>
                <div>Networks: {env.networks?.length || 0}</div>
                <div>Created: {new Date(env.createdAt).toLocaleDateString()}</div>
              </div>
              
              <div className="environment-card-actions">
                <button onClick={() => handleEdit(env)}>Edit</button>
                {env.status === 'running' ? (
                  <button onClick={() => handleStop(env.id)} className="btn-danger">
                    Stop
                  </button>
                ) : (
                  <button onClick={() => handleStart(env.id)} className="btn-success">
                    Start
                  </button>
                )}
                <button onClick={() => handleDelete(env.id)} className="btn-danger">
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default EnvironmentView;

