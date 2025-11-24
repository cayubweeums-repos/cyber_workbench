/**
 * noVNC Viewer Integration
 */

let rfb = null;

/**
 * Initialize noVNC connection
 */
function initNoVNC(websocketPort) {
  const canvas = document.getElementById('novnc-canvas');
  
  // Disconnect existing connection
  if (rfb) {
    rfb.disconnect();
    rfb = null;
  }

  // Clear canvas
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Set canvas size
  resizeCanvas();

  try {
    // Create RFB connection
    rfb = new RFB({
      target: canvas,
      encrypt: false,
      wsProtocols: ['binary'],
      credentials: { password: '' }
    });

    rfb.scaleViewport = true;
    rfb.resizeSession = true;
    rfb.background = '#000000';

    // Event handlers
    rfb.addEventListener('connect', () => {
      console.log('Connected to VNC server');
      canvas.style.backgroundColor = '#000000';
    });

    rfb.addEventListener('disconnect', (e) => {
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

    rfb.addEventListener('credentialsrequired', () => {
      console.log('Credentials required (if any)');
    });

    // Connect to websockify proxy
    const wsUrl = `ws://127.0.0.1:${websocketPort}`;
    console.log('Connecting to VNC via websocket:', wsUrl);
    rfb.connect(wsUrl);

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

/**
 * Resize canvas to fit container
 */
function resizeCanvas() {
  const canvas = document.getElementById('novnc-canvas');
  const container = canvas.parentElement;
  
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
}

// Handle window resize
window.addEventListener('resize', () => {
  resizeCanvas();
  if (rfb) {
    rfb.scaleViewport = true;
  }
});

// Make initNoVNC available globally
window.initNoVNC = initNoVNC;

