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
    
    // Force a reflow to ensure the container is visible before setting up iframe
    void viewerContainer.offsetHeight;
    
    // viewerPort is now the Express port (3000), not websockify port
    if (viewerPort) {
      // VM is running, show VNC iframe (Express serves noVNC)
      progressDiv.style.display = 'none';
      if (iframe) {
        // Ensure iframe is visible and properly sized
        iframe.style.display = 'block';
        iframe.style.visibility = 'visible';
        iframe.style.opacity = '1';
        iframe.style.zIndex = '1';
      }
      // Small delay to ensure DOM is ready and container has dimensions
      setTimeout(() => {
        // Verify viewer-content has dimensions before initializing
        const viewerContent = document.querySelector('.viewer-content');
        if (viewerContent) {
          const rect = viewerContent.getBoundingClientRect();
          console.log('Viewer content dimensions on open:', rect.width, 'x', rect.height);
          if (rect.width === 0 || rect.height === 0) {
            console.warn('Viewer content has zero dimensions, forcing layout...');
            // Force layout recalculation
            viewerContent.style.display = 'none';
            void viewerContent.offsetHeight;
            viewerContent.style.display = '';
          }
        }
        this.initNoVNC(viewerPort);
      }, 150);
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
    
    // Path parameter should be "websockify/{vmName}" without leading slash and without encoding
    // This matches the working URL format: path=websockify/test_full_novnc
    const websockifyPath = `websockify/${vmName}`;
    
    // noVNC URL format - correct path parameter format
    // path should be: websockify/{vmName} (no leading slash, not encoded)
    const novncUrl = `http://localhost:${expressPort}/novnc/vnc.html?host=localhost&port=${expressPort}&path=${websockifyPath}&autoconnect=true&resize=scale&reconnect=true&reconnect_delay=1000`;
    console.log('Loading noVNC from Express:', novncUrl);
    console.log('WebSocket path:', websockifyPath);
    console.log('Full WebSocket URL will be: ws://localhost:' + expressPort + '/' + websockifyPath);
    
    // Ensure iframe fills available space and auto-resizes
    iframe.style.display = 'block';
    iframe.style.visibility = 'visible';
    iframe.style.opacity = '1';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.background = '#000';
    iframe.style.position = 'absolute';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.zIndex = '1';
    
    // Clear any previous src to force reload
    iframe.src = '';
    
    // Small delay to ensure iframe is ready, then set src
    setTimeout(() => {
      console.log('Setting iframe src to:', novncUrl);
      iframe.src = novncUrl;
      
      // Verify iframe is visible
      const rect = iframe.getBoundingClientRect();
      console.log('Iframe dimensions:', rect.width, 'x', rect.height);
      console.log('Iframe visible:', rect.width > 0 && rect.height > 0);
    }, 50);
    
    // Auto-resize iframe when window resizes - use explicit pixel dimensions like test file
    const resizeIframe = () => {
      const viewerContent = document.querySelector('.viewer-content');
      const viewerContainer = document.querySelector('.viewer-container');
      
      if (viewerContent && iframe && viewerContainer) {
        // Get container dimensions (it's position: fixed, so it fills viewport)
        const containerRect = viewerContainer.getBoundingClientRect();
        const headerHeight = document.querySelector('.viewer-header')?.offsetHeight || 60;
        
        // Calculate available space for content (container height minus header)
        const availableWidth = containerRect.width || window.innerWidth;
        const availableHeight = (containerRect.height - headerHeight) || (window.innerHeight - headerHeight);
        
        console.log('Container dimensions:', containerRect.width, 'x', containerRect.height);
        console.log('Header height:', headerHeight);
        console.log('Available space for iframe:', availableWidth, 'x', availableHeight);
        
        // Set explicit pixel dimensions (like test file uses 100vw/100vh)
        iframe.style.width = `${availableWidth}px`;
        iframe.style.height = `${availableHeight}px`;
        
        // Also ensure viewer-content has the same dimensions
        viewerContent.style.width = `${availableWidth}px`;
        viewerContent.style.height = `${availableHeight}px`;
        
        console.log('Iframe set to:', iframe.style.width, 'x', iframe.style.height);
      }
    };
    
    // Initial resize - wait for DOM and layout to settle
    setTimeout(() => {
      resizeIframe();
      // Also trigger on next frame to ensure layout is complete
      requestAnimationFrame(() => {
        resizeIframe();
        // One more check after a brief delay
        setTimeout(resizeIframe, 50);
      });
    }, 200);
    
    // Resize on window resize
    window.addEventListener('resize', resizeIframe);
    
    // Store resize handler so we can remove it later
    this._resizeHandler = resizeIframe;
    
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
      console.log('Iframe src:', iframe.src);
      console.log('Iframe dimensions:', iframe.offsetWidth, 'x', iframe.offsetHeight);
      
      // Check if iframe is actually visible
      const rect = iframe.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        console.error('WARNING: Iframe has zero dimensions!');
        console.error('Viewer content dimensions:', document.querySelector('.viewer-content')?.getBoundingClientRect());
      }
      
      // Try to access iframe content to check for errors
      try {
        const iframeWindow = iframe.contentWindow;
        if (iframeWindow) {
          console.log('Iframe window accessible');
          // Listen for messages from noVNC iframe
          const messageHandler = (event) => {
            if (event.data && typeof event.data === 'string') {
              if (event.data.includes('noVNC') || event.data.includes('RFB')) {
                console.log('noVNC message:', event.data);
              }
            }
          };
          window.addEventListener('message', messageHandler);
          // Store handler for cleanup
          this._messageHandler = messageHandler;
        }
      } catch (e) {
        // Cross-origin restrictions - this is expected
        console.log('Cannot access iframe content (cross-origin, this is normal):', e.message);
      }
      
      // Check iframe after a moment to see if content loaded
      setTimeout(() => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            console.log('Iframe document accessible');
            console.log('Iframe document ready state:', iframeDoc.readyState);
            const body = iframeDoc.body;
            if (body) {
              console.log('Iframe body found, innerHTML length:', body.innerHTML?.length || 0);
            }
          }
        } catch (e) {
          console.log('Cannot access iframe document (cross-origin, this is normal)');
        }
      }, 1000);
    };
  }

  close() {
    // Clear iframe src when closing
    const iframe = document.getElementById('novnc-viewer');
    if (iframe) {
      iframe.src = '';
      iframe.style.display = 'none';
    }
    
    // Remove resize handler
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    
    // Remove message handler
    if (this._messageHandler) {
      window.removeEventListener('message', this._messageHandler);
      this._messageHandler = null;
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
