# noVNC Web Application

A minimal web application that embeds a noVNC client to connect to a VNC server on `localhost:5900`. The app installs, configures, and runs with a single command.

## Quick Start

Simply run:

```bash
make start
```

This single command will:
1. Check for Homebrew and install it if missing
2. Check for Node.js/npm and install via Homebrew if missing
3. Install all project dependencies
4. Start the web server automatically

## Access

Once started, open your browser and navigate to:

```
http://localhost:8080
```

The noVNC client will automatically connect to the VNC server running on `localhost:5900`.

## Architecture

- **HTTP Server**: Express server on port 8080 serves the web interface
- **WebSocket Proxy**: Proxy server on port 6080 bridges WebSocket connections to the VNC server
- **VNC Server**: Expected to be running on `localhost:5900`

## Requirements

- macOS (tested on M1 MacBook)
- Make (usually pre-installed on macOS)
- A VNC server running on `localhost:5900`

## How It Works

The application uses:
- **Express**: Web server to serve the HTML interface
- **noVNC**: Web-based VNC client library
- **node-websockify-js**: WebSocket-to-TCP proxy to bridge browser WebSocket connections to the VNC server's TCP/RFB protocol

## Troubleshooting

- If the connection fails, ensure a VNC server is running on `localhost:5900`
- Check that ports 8080 and 6080 are not in use by other applications
- The Makefile will automatically install Homebrew and Node.js if they're missing
