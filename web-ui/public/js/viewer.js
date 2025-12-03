/**
 * VM Viewer - Handles VM viewing with noVNC via nginx
 * Uses nginx on port 8006 to serve noVNC files and proxy WebSocket connections
 * Follows OOP and modular design
 */
class VMViewer {
  constructor() {
    this.progressInterval = null;
    this.currentVMName = null;
    this.vmService = services.get('vm');
  }

  open(vmName, viewerPort) {
    this.currentVMName = vmName;
    
    // If VM is running, open standalone viewer page (same as test-iframe.html but dynamic)
    if (viewerPort) {
      // Redirect to standalone viewer.html page with VM name parameter
      window.location.href = `/viewer.html?vm=${encodeURIComponent(vmName)}`;
      return;
    }
    
    // VM not running, show progress in embedded viewer
    const viewerContainer = document.getElementById('viewer-container');
    const progressDiv = document.getElementById('viewer-progress');
    const iframe = document.getElementById('novnc-viewer');
    
    viewerContainer.classList.add('active');
    document.getElementById('viewer-title').textContent = `VM Viewer - ${vmName}`;
    
    if (iframe) {
      iframe.style.display = 'none';
      iframe.src = ''; // Clear iframe src
    }
    progressDiv.style.display = 'block';
    this.startProgressPolling(vmName);
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
                // Desktop is ready, redirect to standalone viewer
                const viewerInfo = await this.vmService.getViewerPort(vmName);
                
                if (viewerInfo && viewerInfo.port) {
                  this.stopProgressPolling();
                  // Redirect to standalone viewer page
                  window.location.href = `/viewer.html?vm=${encodeURIComponent(vmName)}`;
                  return;
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
              const viewerInfo = await this.vmService.getViewerPort(vmName);
              
              if (viewerInfo && viewerInfo.port) {
                this.stopProgressPolling();
                // Redirect to standalone viewer page
                window.location.href = `/viewer.html?vm=${encodeURIComponent(vmName)}`;
                return;
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

  async initNoVNC(expressPort) {
    // Use exact same iframe setup as test-iframe.html (simple approach)
    const iframe = document.getElementById('novnc-viewer');
    
    if (!iframe) {
      console.error('noVNC viewer iframe not found');
      return;
    }

    // Express serves noVNC at http://localhost:3000/novnc/vnc.html
    // noVNC will connect to ws://localhost:3000/websockify/{vmName} which Express proxies to the VM's websockify port
    const vmName = this.currentVMName;
    
    // Path parameter should be "websockify/{vmName}" without leading slash and without encoding
    // This matches the working URL format: path=websockify/test_full_novnc
    const websockifyPath = `websockify/${vmName}`;
    
    // noVNC URL format - exact same as test-iframe.html
    const novncUrl = `http://localhost:${expressPort}/novnc/vnc.html?host=localhost&port=${expressPort}&path=${websockifyPath}&autoconnect=true`;
    
    // Set iframe src - simple approach like test file (no delays, no complex setup)
    iframe.src = novncUrl;
    
    // Log successful load (same as test file)
    iframe.onload = () => {
      console.log('Iframe loaded');
      const rect = iframe.getBoundingClientRect();
      console.log('Iframe dimensions:', rect.width, 'x', rect.height);
    };
  }

  close() {
    // Clear iframe src when closing (same as test file cleanup)
    const iframe = document.getElementById('novnc-viewer');
    if (iframe) {
      iframe.src = '';
      iframe.style.display = 'none';
    }
    
    this.stopProgressPolling();
    document.getElementById('viewer-container').classList.remove('active');
    this.currentVMName = null;
  }
}

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
