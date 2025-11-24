/**
 * Express server for VM Manager Web UI
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const { setupRoutes } = require('./api/routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Setup API routes
setupRoutes(app);

// Serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`VM Manager Web UI running on http://localhost:${PORT}`);
  console.log(`Open your browser to http://localhost:${PORT} to access the interface`);
});

