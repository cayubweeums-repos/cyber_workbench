#!/usr/bin/env bash
set -Eeuo pipefail

# Add QMP arguments to QEMU command if enabled
if [[ "$QMP_ENABLE" == [Yy1]* ]]; then

  # Create QMP socket directory (tmpfs resets on container start)
  mkdir -p /tmp/qmp

  # Add QMP socket for machine management (savevm/loadvm)
  ARGS+=" -qmp unix:/tmp/qmp/qmp.sock,server=on,wait=off"

fi

return 0

