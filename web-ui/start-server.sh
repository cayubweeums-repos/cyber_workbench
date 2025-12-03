#!/bin/bash
# Startup script that prompts for sudo password and starts the server

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Check if sudo password is already set in environment
if [ -z "$SUDO_PASSWORD" ]; then
  echo "ISO preparation requires sudo access for operations like:"
  echo "  - Injecting drivers into boot.wim"
  echo "  - Copying drivers to OEM directories"
  echo "  - Rebuilding ISO with mkisofs"
  echo ""
  echo "Please enter your sudo password (it will be stored in memory only):"
  read -s SUDO_PASSWORD
  echo ""
  
  if [ -z "$SUDO_PASSWORD" ]; then
    echo "WARNING: No sudo password provided. Some operations may fail."
    echo "You can set SUDO_PASSWORD environment variable to skip this prompt."
  else
    export SUDO_PASSWORD
    echo "Sudo password set. Starting server..."
  fi
else
  echo "Using sudo password from SUDO_PASSWORD environment variable."
fi

# Start the Node.js server with the sudo password in environment
cd "$SCRIPT_DIR"
exec node server.js

