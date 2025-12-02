/**
 * VM Viewer - Handles VM viewing with noVNC and progress
 * Follows OOP and modular design
 */
class VMViewer {
  constructor() {
    this.progressInterval = null;
    this.currentVMName = null;
    this.vmService = services.get('vm');
  }

  open(vmName, websocketPort) {
    this.currentVMName = vmName;
    const viewerContainer = document.getElementById('viewer-container');
    const progressDiv = document.getElementById('viewer-progress');
    const iframe = document.getElementById('novnc-viewer');
    
    viewerContainer.classList.add('active');
    document.getElementById('viewer-title').textContent = `VM Viewer - ${vmName}`;
    
    if (websocketPort) {
      // VM is running, show VNC iframe (like vapiorc)
      progressDiv.style.display = 'none';
      if (iframe) {
        iframe.style.display = 'block';
      }
      this.initNoVNC(websocketPort);
      this.stopProgressPolling();
    } else {
      // VM not running, show progress
      if (iframe) {
        iframe.style.display = 'none';
        iframe.src = ''; // Clear iframe src
      }
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
                  const iframe = document.getElementById('novnc-viewer');
                  if (iframe) {
                    iframe.style.display = 'block';
                  }
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
                const iframe = document.getElementById('novnc-viewer');
                if (iframe) {
                  iframe.style.display = 'block';
                }
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
    // Use iframe approach like vapiorc - websockify serves noVNC with --web flag
    const iframe = document.getElementById('novnc-viewer');
    
    if (!iframe) {
      console.error('noVNC viewer iframe not found');
      return;
    }

    // Serve noVNC from Express (like vapiorc uses nginx)
    // websockify only handles WebSocket connections, not static files
    // This avoids 405 errors from websockify --web flag
    // Serve noVNC from Express (like vapiorc uses nginx)
    // websockify only handles WebSocket connections, not static files
    // noVNC is served from /novnc/ and connects to websockify via WebSocket
    const novncUrl = `/novnc/vnc.html?host=127.0.0.1&port=${websocketPort}&autoconnect=true&resize=scale&reconnect=true`;
    console.log('Loading noVNC from Express server:', novncUrl);
    console.log('WebSocket will connect to: ws://127.0.0.1:' + websocketPort + '/');
    
    iframe.style.display = 'block';
    iframe.src = novncUrl;
    
    // Handle iframe load errors
    iframe.onerror = (error) => {
      console.error('Failed to load noVNC iframe:', error);
      iframe.style.display = 'none';
      // Show error message
      const viewerContent = document.querySelector('.viewer-content');
      if (viewerContent) {
        viewerContent.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #f00; text-align: center;">
            <div>
              <p>Error: Failed to load noVNC viewer</p>
              <p style="font-size: 12px; color: #888;">Websockify may not be running on port ${websocketPort}</p>
              <p style="font-size: 12px; color: #888;">Check that websockify started with --web flag</p>
            </div>
          </div>
        `;
      }
    };
    
    // Log successful load
    iframe.onload = () => {
      console.log('noVNC iframe loaded successfully');
    };
  }

  close() {
    // Clear iframe src when closing (like vapiorc)
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

