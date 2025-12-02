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
app.use(express.static(path.join(__dirname, 'public')));

// Setup API routes
setupRoutes(app);

// Serve docs.html for /docs route
app.get('/docs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'docs.html'));
});

// Serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`VM Manager Web UI running on http://localhost:${PORT}`);
  console.log(`Open your browser to http://localhost:${PORT} to access the interface`);
});

