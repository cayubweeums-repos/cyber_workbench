#!/usr/bin/env bash
set -Eeuo pipefail

QGA_SOCKET="/tmp/qga/qga.sock"

# Wait for QGA socket to be available
MAX_WAIT=120
WAIT_COUNT=0

echo "Waiting for QGA socket..."
while [ ! -S "$QGA_SOCKET" ] && [ $WAIT_COUNT -lt $MAX_WAIT ]; do
  sleep 2
  WAIT_COUNT=$((WAIT_COUNT + 1))
done

if [ ! -S "$QGA_SOCKET" ]; then
  echo "Warning: QGA socket not available after $MAX_WAIT seconds. API server will not start."
  exit 1
fi

echo "QGA socket available. Starting API server on port 8007..."

# Create log directory
mkdir -p /var/log/qga

# Start the Python API server with output redirection
exec python3 -u /run/qga-api.py 2>&1 | tee /var/log/qga/api.log

