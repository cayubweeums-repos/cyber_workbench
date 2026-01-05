#!/usr/bin/env bash
set -Eeuo pipefail

: "${APP:="Windows"}"
: "${PLATFORM:="x64"}"
: "${BOOT_MODE:="windows"}"
: "${SUPPORT:=""}"

cd /run

. start.sh           # Startup hook
. utils.sh           # Load functions
. reset.sh           # Initialize system
. server.sh          # Start webserver
. server-qga.sh      # Configure QGA nginx proxy
. guacamole.sh       # Initialize Guacamole
. guacamole-nginx.sh # Configure Guacamole nginx proxy
. guacamole-auto-connect.sh # Setup auto-connect page
. qga-setup.sh       # Initialize QGA
. define.sh     # Define versions
. mido.sh       # Download Windows
. install.sh    # Run installation
. disk.sh       # Initialize disks
. display.sh    # Initialize graphics
. network.sh    # Initialize network
. samba.sh      # Configure samba
. boot.sh       # Configure boot
. proc.sh       # Initialize processor
. power.sh      # Configure shutdown
. memory.sh     # Check available memory
. config.sh     # Configure arguments
. qga-args.sh   # Add QGA arguments
. qmp-args.sh   # Add QMP arguments
. uefi-readonly.sh # Configure UEFI read-only mode if needed
. finish.sh     # Finish initialization

trap - ERR

version=$(qemu-system-x86_64 --version | head -n 1 | cut -d '(' -f 1 | awk '{ print $NF }')
info "Booting ${APP}${BOOT_DESC} using QEMU v$version..."

# Start QGA API server immediately (no delay)
if [[ "$QGA_ENABLE" == [Yy1]* ]]; then
  /run/qga-api.sh &
fi

{ qemu-system-x86_64 ${ARGS:+ $ARGS} >"$QEMU_OUT" 2>"$QEMU_LOG"; rc=$?; } || :
(( rc != 0 )) && error "$(<"$QEMU_LOG")" && exit 15

terminal
( sleep 30; boot ) &
tail -fn +0 "$QEMU_LOG" --pid=$$ 2>/dev/null &
cat "$QEMU_TERM" 2> /dev/null | tee "$QEMU_PTY" | \
sed -u -e 's/\x1B\[[=0-9;]*[a-z]//gi' \
-e 's/\x1B\x63//g' -e 's/\x1B\[[=?]7l//g' \
-e '/^$/d' -e 's/\x44\x53\x73//g' \
-e 's/failed to load Boot/skipped Boot/g' \
-e 's/0): Not Found/0)/g' & wait $! || :

sleep 1 & wait $!
[ ! -f "$QEMU_END" ] && finish 0
