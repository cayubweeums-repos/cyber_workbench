/**
 * Express server for VM Manager Web UI
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { setupRoutes } = require('./api/routes');
const sudoPassword = require('./api/sudo-password');
const vmTracker = require('./api/vm-tracker');

const app = express();
const PORT = process.env.PORT || 3000;
const REPO_ROOT = path.join(__dirname, '..');

// Initialize sudo password from environment variable
if (sudoPassword.initializeFromEnv()) {
  console.log('Sudo password initialized from environment variable');
} else {
  console.log('WARNING: SUDO_PASSWORD environment variable not set. Some operations may fail.');
  console.log('Set SUDO_PASSWORD environment variable or operations requiring sudo will prompt.');
}

// Middleware
app.use(cors());
app.use(express.json());

// Setup API routes BEFORE static files to ensure API routes work
setupRoutes(app);

// Serve static files (must come after API routes but before catch-all)
// This ensures JS/CSS/images are served correctly with proper MIME types
app.use(express.static(path.join(__dirname, 'public'), {
  // Set proper MIME types for ES modules and other files
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  }
}));

// Serve noVNC files from the novnc directory (simpler than nginx!)
const novncDir = path.join(REPO_ROOT, 'novnc');
app.use('/novnc', express.static(novncDir));

// Proxy WebSocket connections to websockify ports
// Format: /websockify/:vmName -> proxies to the VM's websockify port
app.use('/websockify/:vmName', async (req, res, next) => {
  const { vmName } = req.params;
  try {
    const websockifyPort = await vmTracker.getWebsockifyPort(vmName);
    if (!websockifyPort) {
      return res.status(404).json({ error: `VM ${vmName} not found or websockify not running` });
    }

    // Create proxy middleware for this specific VM
    const proxy = createProxyMiddleware({
      target: `http://127.0.0.1:${websockifyPort}`,
      ws: true, // Enable WebSocket proxying
      changeOrigin: true,
      logLevel: 'warn'
    });

    proxy(req, res, next);
  } catch (error) {
    console.error(`Error proxying to websockify for ${vmName}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Serve docs.html for /docs route
app.get('/docs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'docs.html'));
});

// Serve index.html for all non-API, non-static routes (SPA fallback)
// This must be LAST so it doesn't catch static file requests
app.get('*', (req, res) => {
  // Don't serve index.html for file requests with extensions (they should 404 if not found)
  // This prevents the catch-all from intercepting static file requests
  if (req.path.match(/\.[a-zA-Z0-9]+$/)) {
    return res.status(404).send('File not found');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server with WebSocket support
const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`VM Manager Web UI running on http://localhost:${PORT}`);
  console.log(`Open your browser to http://localhost:${PORT} to access the interface`);
  console.log(`noVNC served directly from Express (no nginx required!)`);
  
  // Clean up any stale VM tracker entries on startup
  try {
    await vmTracker.cleanupStaleVMs();
    console.log('VM tracker cleaned up');
  } catch (error) {
    console.warn('Failed to cleanup VM tracker:', error.message);
  }
});

// http-proxy-middleware automatically handles WebSocket upgrades when ws: true is set
// No additional upgrade handler needed!

