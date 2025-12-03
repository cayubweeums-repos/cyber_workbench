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
    const viewerContainer = document.getElementById('viewer-container');
    const progressDiv = document.getElementById('viewer-progress');
    const iframe = document.getElementById('novnc-viewer');
    
    viewerContainer.classList.add('active');
    document.getElementById('viewer-title').textContent = `VM Viewer - ${vmName}`;
    
    // viewerPort is now the nginx port (8006), not websockify port
    if (viewerPort) {
      // VM is running, show VNC iframe (nginx serves noVNC)
      progressDiv.style.display = 'none';
      if (iframe) {
        iframe.style.display = 'block';
      }
      this.initNoVNC(viewerPort);
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
                const viewerInfo = await this.vmService.getViewerPort(vmName);
                
                if (viewerInfo && viewerInfo.port) {
                  this.stopProgressPolling();
                  document.getElementById('viewer-progress').style.display = 'none';
                  const iframe = document.getElementById('novnc-viewer');
                  if (iframe) {
                    iframe.style.display = 'block';
                  }
                  this.initNoVNC(viewerInfo.port);
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
                document.getElementById('viewer-progress').style.display = 'none';
                const iframe = document.getElementById('novnc-viewer');
                if (iframe) {
                  iframe.style.display = 'block';
                }
                this.initNoVNC(viewerInfo.port);
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
    // Use iframe approach - Express serves noVNC directly
    // Express proxies WebSocket connections to websockify
    const iframe = document.getElementById('novnc-viewer');
    
    if (!iframe) {
      console.error('noVNC viewer iframe not found');
      return;
    }

    // Express serves noVNC at http://localhost:3000/novnc/vnc.html
    // noVNC will connect to ws://localhost:3000/websockify/{vmName} which Express proxies to the VM's websockify port
    const vmName = this.currentVMName;
    const websockifyPath = `/websockify/${vmName}`;
    
    // noVNC URL format - match vapiorc's approach
    // vapiorc uses: http://localhost:8006/ (root path)
    // We use: http://localhost:3000/novnc/vnc.html with WebSocket path parameter
    // The path parameter is critical - it tells noVNC where to connect the WebSocket
    const novncUrl = `http://localhost:${expressPort}/novnc/vnc.html?host=localhost&port=${expressPort}&path=${encodeURIComponent(websockifyPath)}&autoconnect=true&resize=scale&reconnect=true&reconnect_delay=1000`;
    console.log('Loading noVNC from Express:', novncUrl);
    console.log('WebSocket path:', websockifyPath);
    console.log('Full WebSocket URL will be: ws://localhost:' + expressPort + websockifyPath);
    
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
              <p style="font-size: 12px; color: #888;">Express server may not be running on port ${expressPort}</p>
              <p style="font-size: 12px; color: #888;">Check that the server is started and noVNC files are available</p>
              <p style="font-size: 12px; color: #888;">Run: make setup-novnc to install noVNC files</p>
            </div>
          </div>
        `;
      }
    };
    
    // Log successful load and check for WebSocket connection
    iframe.onload = () => {
      console.log('noVNC iframe loaded successfully');
      
      // Try to access iframe content to check for errors
      try {
        const iframeWindow = iframe.contentWindow;
        if (iframeWindow) {
          // Listen for messages from noVNC iframe
          window.addEventListener('message', (event) => {
            if (event.data && typeof event.data === 'string') {
              if (event.data.includes('noVNC') || event.data.includes('RFB')) {
                console.log('noVNC message:', event.data);
              }
            }
          });
        }
      } catch (e) {
        // Cross-origin restrictions - this is expected if noVNC is on a different origin
        console.log('Cannot access iframe content (cross-origin):', e.message);
      }
    };
  }

  close() {
    // Clear iframe src when closing
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
