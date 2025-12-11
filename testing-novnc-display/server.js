const express = require('express');
const path = require('path');
const Websockify = require('node-websockify-js');

const app = express();
const HTTP_PORT = 8080;
const WS_PROXY_PORT = 6080;
const VNC_TARGET = 'localhost:5900';

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve noVNC library files from node_modules
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

// Start Express server
app.listen(HTTP_PORT, () => {
  console.log(`HTTP server running at http://localhost:${HTTP_PORT}`);
  console.log(`WebSocket proxy will forward to ${VNC_TARGET}`);
});

// Start WebSocket proxy
(async () => {
  try {
    const wsockify = new Websockify({
      source: `localhost:${WS_PROXY_PORT}`,
      target: VNC_TARGET,
    });

    await wsockify.start();
    console.log(`WebSocket proxy running on ws://localhost:${WS_PROXY_PORT}`);
  } catch (error) {
    console.error('Failed to start WebSocket proxy:', error);
    process.exit(1);
  }
})();
