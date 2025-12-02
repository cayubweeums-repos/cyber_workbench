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
          const percent = progress.percent || 0;
          const stage = progress.stage || 'Processing...';
          const message = progress.message || '';
          const details = progress.details || '';
          
          document.getElementById('viewer-progress-fill').style.width = `${percent}%`;
          document.getElementById('viewer-progress-stage').textContent = stage;
          document.getElementById('viewer-progress-message').textContent = message;
          document.getElementById('viewer-progress-details').textContent = details;
          
          // If stage is "Ready", don't auto-transition - let user start VM manually
          if (stage === 'Ready' && percent === 100) {
            // Keep showing progress, user can start VM when ready
            return;
          }
        } else {
          // No progress, check if VM is running
          const running = await this.vmService.getStatus(vmName);
          
          if (running) {
            // VM started, check if desktop is ready
            try {
              const desktopReady = await this.vmService.checkDesktopReady(vmName);
              
              if (desktopReady.ready) {
                // Desktop is ready, get viewer port and show VNC
                const port = await this.vmService.getViewerPort(vmName);
                
                if (port) {
                  this.stopProgressPolling();
                  document.getElementById('viewer-progress').style.display = 'none';
                  document.getElementById('novnc-canvas').style.display = 'block';
                  this.initNoVNC(port);
                }
              } else {
                // Desktop not ready yet, show status
                document.getElementById('viewer-progress-stage').textContent = 'Waiting for desktop...';
                document.getElementById('viewer-progress-message').textContent = desktopReady.error || 'Desktop is starting up';
                document.getElementById('viewer-progress-details').textContent = desktopReady.details || '';
              }
            } catch (error) {
              // QGA not available or error, try to get viewer port anyway
              console.warn('Desktop ready check failed:', error);
              const port = await this.vmService.getViewerPort(vmName);
              
              if (port) {
                this.stopProgressPolling();
                document.getElementById('viewer-progress').style.display = 'none';
                document.getElementById('novnc-canvas').style.display = 'block';
                this.initNoVNC(port);
              }
            }
          }
        }
      } catch (error) {
        console.error('Progress polling error:', error);
      }
    };
    
    updateProgress();
    this.progressInterval = setInterval(updateProgress, 2000); // Check every 2 seconds
  }

  stopProgressPolling() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  async initNoVNC(websocketPort) {
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

    // Wait for RFB to be available (ES module loads asynchronously)
    // Use event-based waiting for better reliability
    if (typeof window.RFB === 'undefined') {
      console.log('Waiting for noVNC library to load...');
      
      // Wait for the novnc-loaded event or check window.RFB periodically
      const rfbReady = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for noVNC library to load (10 seconds)'));
        }, 10000); // 10 second timeout
        
        const onLoaded = (e) => {
          clearTimeout(timeout);
          window.removeEventListener('novnc-loaded', onLoaded);
          window.removeEventListener('novnc-error', onError);
          resolve(e.detail?.RFB || window.RFB);
        };
        
        const onError = (e) => {
          clearTimeout(timeout);
          window.removeEventListener('novnc-loaded', onLoaded);
          window.removeEventListener('novnc-error', onError);
          reject(new Error(e.detail?.error?.message || e.detail?.error || 'Failed to load noVNC'));
        };
        
        window.addEventListener('novnc-loaded', onLoaded, { once: true });
        window.addEventListener('novnc-error', onError, { once: true });
        
        // Also poll in case event was already fired before we set up listeners
        const pollInterval = setInterval(() => {
          if (typeof window.RFB !== 'undefined') {
            clearInterval(pollInterval);
            clearTimeout(timeout);
            window.removeEventListener('novnc-loaded', onLoaded);
            window.removeEventListener('novnc-error', onError);
            resolve(window.RFB);
          }
        }, 100);
        
        // Cleanup polling on timeout
        setTimeout(() => clearInterval(pollInterval), 10000);
      });
      
      try {
        await rfbReady;
        console.log('noVNC library loaded successfully');
      } catch (error) {
        console.error('RFB is not defined after waiting. noVNC ES module may not have loaded:', error);
        ctx.fillStyle = '#f00';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Error: noVNC library not loaded. Please refresh the page.', canvas.width / 2, canvas.height / 2);
        ctx.fillText(`Error: ${error.message}`, canvas.width / 2, canvas.height / 2 + 20);
        console.error('Available globals:', Object.keys(window).filter(k => k.toLowerCase().includes('rfb') || k.toLowerCase().includes('vnc')));
        console.error('Check browser console for ES module import errors');
        return;
      }
    }

    try {
      // Create RFB connection (using window.RFB from ES module, like dockur/windows)
      this.rfb = new window.RFB({
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

