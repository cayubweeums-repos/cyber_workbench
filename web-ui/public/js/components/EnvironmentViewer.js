/**
 * Environment Viewer Component - Visual n8n-style viewer for environments
 * Uses vis-network for node-based visualization
 */
class EnvironmentViewer extends BaseComponent {
  constructor(containerId) {
    const container = document.getElementById(containerId);
    super(container);
    this.environmentService = null;
    this.network = null;
    this.environment = null;
    this.updateInterval = null;
  }

  render() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="viewer-header">
        <div class="viewer-title" id="environment-viewer-title">Environment Viewer</div>
        <div class="viewer-actions">
          <button class="btn btn-secondary btn-small" id="close-environment-viewer-btn">Close</button>
        </div>
      </div>
      <div class="viewer-content">
        <div id="environment-network-container" style="width: 100%; height: 100%; position: relative;">
          <div class="loading" id="environment-viewer-loading">
            <div class="spinner"></div>
            <p>Loading environment...</p>
          </div>
        </div>
        <div id="environment-node-details" class="node-details-panel" style="display: none;">
          <h4>Node Details</h4>
          <div id="node-details-content"></div>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    if (!this.container) return;
    
    const closeBtn = this.container.querySelector('#close-environment-viewer-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.close();
      });
    }
  }

  async open(environmentName, environmentService) {
    this.environmentService = environmentService;
    this.environment = null;
    
    if (!this.container) {
      this.render();
      this.attachEventListeners();
    }
    
    this.container.style.display = 'block';
    
    try {
      // Wait for vis-network to be available
      await this.waitForVisNetwork();
      
      // Load environment data
      this.environment = await environmentService.getFullEnvironmentData(environmentName);
      if (!this.environment) {
        throw new Error('Environment not found');
      }
      
      // Update title
      const title = this.container.querySelector('#environment-viewer-title');
      if (title) {
        title.textContent = `Environment: ${environmentName}`;
      }
      
      // Render network
      this.renderNetwork();
      
      // Start auto-update
      this.startAutoUpdate();
    } catch (error) {
      console.error('Failed to load environment:', error);
      const container = this.container.querySelector('#environment-network-container');
      if (container) {
        container.innerHTML = `<div class="empty-state"><p style="color: #ff4444;">Failed to load environment: ${error.message}</p></div>`;
      }
    }
  }

  waitForVisNetwork(maxWait = 5000) {
    return new Promise((resolve, reject) => {
      // Check if already available
      if (this.isVisNetworkAvailable()) {
        resolve();
        return;
      }
      
      // Wait for it to load
      let attempts = 0;
      const maxAttempts = maxWait / 100;
      const interval = setInterval(() => {
        attempts++;
        if (this.isVisNetworkAvailable()) {
          clearInterval(interval);
          resolve();
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          reject(new Error('vis-network library failed to load within timeout'));
        }
      }, 100);
    });
  }

  isVisNetworkAvailable() {
    if (typeof vis !== 'undefined') {
      if (vis.network && vis.network.Network) {
        return true;
      } else if (vis.Network) {
        return true;
      } else if (window.vis && window.vis.network && window.vis.network.Network) {
        return true;
      } else if (window.vis && window.vis.Network) {
        return true;
      }
    }
    return false;
  }

  renderNetwork() {
    const container = this.container.querySelector('#environment-network-container');
    if (!container || !this.environment) return;
    
    // Hide loading
    const loading = container.querySelector('#environment-viewer-loading');
    if (loading) {
      loading.style.display = 'none';
    }
    
    // Clear container
    const networkDiv = document.createElement('div');
    networkDiv.id = 'environment-network';
    networkDiv.style.width = '100%';
    networkDiv.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(networkDiv);
    
    // Create nodes and edges
    const nodes = [];
    const edges = [];
    
    // Create nodes for each service
    this.environment.services.forEach((service, index) => {
      const nodeId = `service-${index}`;
      const resources = `CPU: ${service.cpu_cores}, RAM: ${service.ram_gb}GB, Disk: ${service.disk_size_gb}GB`;
      
      nodes.push({
        id: nodeId,
        label: `${service.name}\n${service.type}`,
        title: `${service.name}\nType: ${service.type}\n${resources}\nStatus: ${this.environment.status}`,
        color: this.environment.isRunning ? '#dafc7b' : '#77874c',
        shape: 'box',
        font: { color: '#262626', size: 14 },
        data: {
          service: service,
          index: index
        }
      });
    });
    
    // Create edges for services on same network
    const networkGroups = {};
    this.environment.services.forEach((service, index) => {
      if (service.network) {
        if (!networkGroups[service.network]) {
          networkGroups[service.network] = [];
        }
        networkGroups[service.network].push(index);
      }
    });
    
    // Create edges within each network
    Object.values(networkGroups).forEach((indices, networkIndex) => {
      const color = this.getNetworkColor(networkIndex);
      for (let i = 0; i < indices.length; i++) {
        for (let j = i + 1; j < indices.length; j++) {
          edges.push({
            from: `service-${indices[i]}`,
            to: `service-${indices[j]}`,
            color: color,
            width: 2,
            smooth: { type: 'continuous' }
          });
        }
      }
    });
    
    // Create network
    const data = { nodes: nodes, edges: edges };
    const options = {
      nodes: {
        borderWidth: 2,
        shadow: true,
        font: {
          size: 14,
          face: 'Arial'
        }
      },
      edges: {
        arrows: {
          to: { enabled: false }
        },
        smooth: {
          type: 'continuous'
        }
      },
      physics: {
        enabled: true,
        stabilization: { iterations: 200 }
      },
      interaction: {
        hover: true,
        tooltipDelay: 100,
        zoomView: true,
        dragView: true
      }
    };
    
    // Initialize vis-network
    // Check for different possible export structures
    let NetworkConstructor = null;
    if (typeof vis !== 'undefined') {
      // Try different possible export paths
      if (vis.network && vis.network.Network) {
        NetworkConstructor = vis.network.Network;
      } else if (vis.Network) {
        NetworkConstructor = vis.Network;
      } else if (window.vis && window.vis.network && window.vis.network.Network) {
        NetworkConstructor = window.vis.network.Network;
      } else if (window.vis && window.vis.Network) {
        NetworkConstructor = window.vis.Network;
      }
    }
    
    if (NetworkConstructor) {
      try {
        this.network = new NetworkConstructor(networkDiv, data, options);
        
        // Handle node click
        this.network.on('click', (params) => {
          if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            const node = nodes.find(n => n.id === nodeId);
            if (node) {
              const service = node.data.service;
              // If it's a WindowsVM, open VM viewer
              if (service.type === 'WindowsVM') {
                this.openVMViewer(service.name);
              } else {
                // For other service types, show details
                this.showNodeDetails(service);
              }
            }
          } else {
            this.hideNodeDetails();
          }
        });
        
        // Handle edge hover
        this.network.on('hoverEdge', (params) => {
          // Could show network name on hover
        });
      } catch (error) {
        console.error('Error creating vis-network:', error);
        networkDiv.innerHTML = `<div class="empty-state"><p style="color: #ff4444;">Failed to create network visualization: ${error.message}</p></div>`;
      }
    } else {
      // Fallback if vis-network not loaded
      console.error('vis-network not available. typeof vis:', typeof vis, 'vis object:', vis);
      networkDiv.innerHTML = '<div class="empty-state"><p style="color: #ff4444;">vis-network library not loaded. Please check that the library is properly included.</p></div>';
    }
  }

  async openVMViewer(vmName) {
    // Emit event to open VM viewer with environment name
    const event = new CustomEvent('open-vm-viewer', {
      detail: { 
        vmName: vmName,
        environmentName: this.environment ? this.environment.name : null
      }
    });
    document.dispatchEvent(event);
  }

  showNodeDetails(service) {
    const detailsPanel = this.container.querySelector('#environment-node-details');
    const detailsContent = this.container.querySelector('#node-details-content');
    
    if (!detailsPanel || !detailsContent) return;
    
    const tools = this.environment.tools[service.name] || {};
    const toolNames = Object.keys(tools);
    
    detailsContent.innerHTML = `
      <div class="node-detail-item">
        <strong>Name:</strong> ${service.name}
      </div>
      <div class="node-detail-item">
        <strong>Type:</strong> ${service.type}
      </div>
      <div class="node-detail-item">
        <strong>Resources:</strong>
        <ul>
          <li>CPU: ${service.cpu_cores} cores</li>
          <li>RAM: ${service.ram_gb} GB</li>
          <li>Disk: ${service.disk_size_gb} GB</li>
        </ul>
      </div>
      <div class="node-detail-item">
        <strong>Network:</strong> ${service.network || 'None'}
      </div>
      ${toolNames.length > 0 ? `
        <div class="node-detail-item">
          <strong>Tools:</strong>
          <ul>
            ${toolNames.map(tool => `<li>${tool}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      ${service.type === 'WindowsVM' ? `
        <div class="node-detail-item">
          <button class="btn btn-primary btn-small" data-action="open-vm-viewer" data-vm="${service.name}">
            Open VM Viewer
          </button>
        </div>
      ` : ''}
    `;
    
    // Attach click handler for VM viewer button
    const vmViewerBtn = detailsContent.querySelector('[data-action="open-vm-viewer"]');
    if (vmViewerBtn) {
      vmViewerBtn.addEventListener('click', () => {
        this.openVMViewer(service.name);
      });
    }
    
    detailsPanel.style.display = 'block';
  }

  hideNodeDetails() {
    const detailsPanel = this.container.querySelector('#environment-node-details');
    if (detailsPanel) {
      detailsPanel.style.display = 'none';
    }
  }

  getNetworkColor(index) {
    const colors = ['#dafc7b', '#7b8afc', '#fc7b8a', '#8afc7b', '#fc8a7b'];
    return colors[index % colors.length];
  }

  startAutoUpdate(interval = 2000) {
    this.stopAutoUpdate();
    this.updateInterval = setInterval(async () => {
      if (this.environment && this.environmentService) {
        try {
          const updated = await this.environmentService.getFullEnvironmentData(this.environment.name);
          if (updated) {
            this.environment = updated;
            this.renderNetwork();
          }
        } catch (error) {
          console.error('Failed to update environment:', error);
        }
      }
    }, interval);
  }

  stopAutoUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  close() {
    this.stopAutoUpdate();
    if (this.container) {
      this.container.style.display = 'none';
    }
    if (this.network) {
      this.network.destroy();
      this.network = null;
    }
  }

  destroy() {
    this.close();
    super.destroy();
  }
}

