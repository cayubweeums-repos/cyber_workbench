/**
 * Express server for VM Manager Web UI
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const { setupRoutes } = require('./api/routes');
const sudoPassword = require('./api/sudo-password');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Serve noVNC files from repo root (like vapiorc uses nginx)
// We serve noVNC from Express, websockify only handles WebSocket connections
const novncPath = path.join(__dirname, '..', 'novnc');
if (require('fs').existsSync(novncPath)) {
  app.use('/novnc', express.static(novncPath));
  console.log(`noVNC files available at /novnc/ (served from Express, like vapiorc uses nginx)`);
}

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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`VM Manager Web UI running on http://localhost:${PORT}`);
  console.log(`Open your browser to http://localhost:${PORT} to access the interface`);
});

