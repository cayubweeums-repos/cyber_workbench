#!/usr/bin/env bash
set -Eeuo pipefail

# Add QGA arguments to QEMU command if enabled
if [[ "$QGA_ENABLE" == [Yy1]* ]]; then

  # Add virtio-serial channel for QGA communication
  ARGS+=" -chardev socket,path=/tmp/qga/qga.sock,server=on,wait=off,id=qga0"
  ARGS+=" -device virtio-serial"
  ARGS+=" -device virtserialport,chardev=qga0,name=org.qemu.guest_agent.0"

fi

return 0

