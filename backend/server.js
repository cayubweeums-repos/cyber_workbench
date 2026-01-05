const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const path = require('path');
const { setupRoutes } = require('./api/routes');
const { buildWindowsImage } = require('./utils/build');
const { startLifecycleManager } = require('./utils/lifecycle');

const app = express();
const PORT = process.env.PORT || 8080;
const IS_FEDORA = process.env.IS_FEDORA === 'true';

// Windows image build state (shared across modules)
const imageBuildState = {
  isBuilding: false,
  isReady: false,
  progress: 0,
  currentStep: '',
  error: null,
  logs: []
};

// Middleware
app.use(cors()); // Enable CORS for React frontend
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup all API routes
setupRoutes(app, imageBuildState);

// WebSocket for real-time updates
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  ws.on('message', (message) => console.log('Received:', message));
  ws.on('close', () => console.log('WebSocket client disconnected'));
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Unified Hypervisor System API running on http://localhost:${PORT}`);
  console.log(`SELinux mode: ${IS_FEDORA ? 'enabled (:z volumes)' : 'disabled'}`);
  
  // Start building Windows image in background
  console.log('Starting background build of Windows image...');
  buildWindowsImage(imageBuildState).catch(err => {
    console.error('Windows image build failed:', err);
  });
  
  // guacenc is built into this container (/usr/local/bin/guacenc)
  console.log('guacenc available for recording conversion (built-in)');
  
  // Start VM lifecycle manager
  startLifecycleManager();
});

// WebSocket upgrade handler
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

