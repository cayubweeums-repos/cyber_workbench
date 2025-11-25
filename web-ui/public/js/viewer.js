/**
 * VM Viewer - Handles VM viewing with noVNC and progress
 * Follows OOP and modular design
 */
class VMViewer {
  constructor() {
    this.rfb = null;
    this.progressInterval = null;
    this.currentVMName = null;
    this.vmService = services.get('vm');
  }

  open(vmName, websocketPort) {
    this.currentVMName = vmName;
    const viewerContainer = document.getElementById('viewer-container');
    const progressDiv = document.getElementById('viewer-progress');
    const canvas = document.getElementById('novnc-canvas');
    
    viewerContainer.classList.add('active');
    document.getElementById('viewer-title').textContent = `VM Viewer - ${vmName}`;
    
    if (websocketPort) {
      // VM is running, show VNC
      progressDiv.style.display = 'none';
      canvas.style.display = 'block';
      this.initNoVNC(websocketPort);
      this.stopProgressPolling();
    } else {
      // VM not running, show progress
      canvas.style.display = 'none';
      progressDiv.style.display = 'block';
      this.startProgressPolling(vmName);
    }
  }

  startProgressPolling(vmName) {
    this.stopProgressPolling();
    
    const updateProgress = async () => {
      try {
        const progress = await this.vmService.getProgress(vmName);
        
        if (progress) {
          document.getElementById('viewer-progress-fill').style.width = `${progress.percent || 0}%`;
          document.getElementById('viewer-progress-stage').textContent = progress.stage || 'Processing...';
          document.getElementById('viewer-progress-message').textContent = progress.message || '';
          document.getElementById('viewer-progress-details').textContent = progress.details || '';
        } else {
          // No progress, check if VM is running
          const running = await this.vmService.getStatus(vmName);
          
          if (running) {
            // VM started, get viewer port
            const port = await this.vmService.getViewerPort(vmName);
            
            if (port) {
              this.stopProgressPolling();
              document.getElementById('viewer-progress').style.display = 'none';
              document.getElementById('novnc-canvas').style.display = 'block';
              this.initNoVNC(port);
            }
          }
        }
      } catch (error) {
        console.error('Progress polling error:', error);
      }
    };
    
    updateProgress();
    this.progressInterval = setInterval(updateProgress, 1000);
  }

  stopProgressPolling() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  initNoVNC(websocketPort) {
    const canvas = document.getElementById('novnc-canvas');
    
    // Disconnect existing connection
    if (this.rfb) {
      this.rfb.disconnect();
      this.rfb = null;
    }

    // Clear canvas
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Set canvas size
    this.resizeCanvas();

    try {
      // Create RFB connection
      this.rfb = new RFB({
        target: canvas,
        encrypt: false,
        wsProtocols: ['binary'],
        credentials: { password: '' }
      });

      this.rfb.scaleViewport = true;
      this.rfb.resizeSession = true;
      this.rfb.background = '#000000';

      // Event handlers
      this.rfb.addEventListener('connect', () => {
        console.log('Connected to VNC server');
        canvas.style.backgroundColor = '#000000';
      });

      this.rfb.addEventListener('disconnect', (e) => {
        const reason = e.detail.clean ? 'clean' : 'unclean';
        console.log('Disconnected from VNC server:', reason);
        
        // Show disconnect message on canvas
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Disconnected: ${reason}`, canvas.width / 2, canvas.height / 2);
      });

      this.rfb.addEventListener('credentialsrequired', () => {
        console.log('Credentials required (if any)');
      });

      // Connect to websockify proxy
      const wsUrl = `ws://127.0.0.1:${websocketPort}`;
      console.log('Connecting to VNC via websocket:', wsUrl);
      this.rfb.connect(wsUrl);

    } catch (error) {
      console.error('Error initializing VNC:', error);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#f00';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`Error: ${error.message}`, canvas.width / 2, canvas.height / 2);
    }
  }

  resizeCanvas() {
    const canvas = document.getElementById('novnc-canvas');
    const container = canvas.parentElement;
    
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  }

  close() {
    document.getElementById('viewer-container').classList.remove('active');
    if (this.rfb) {
      this.rfb.disconnect();
      this.rfb = null;
    }
    this.stopProgressPolling();
    this.currentVMName = null;
  }
}

// Handle window resize
window.addEventListener('resize', () => {
  const canvas = document.getElementById('novnc-canvas');
  if (canvas) {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  }
  if (window.vmViewerInstance && window.vmViewerInstance.rfb) {
    window.vmViewerInstance.rfb.scaleViewport = true;
  }
});

// Export for global access (backward compatibility)
window.VMViewer = VMViewer;
window.openViewer = (vmName, port) => {
  if (!window.vmViewerInstance) {
    window.vmViewerInstance = new VMViewer();
  }
  window.vmViewerInstance.open(vmName, port);
};
window.closeViewer = () => {
  if (window.vmViewerInstance) {
    window.vmViewerInstance.close();
  }
};

