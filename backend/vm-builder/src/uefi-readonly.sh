#!/usr/bin/env bash
set -Eeuo pipefail

# Make UEFI variables read-only if UEFI_READONLY is set
# This allows savevm/loadvm to work properly for template creation

if [[ "${UEFI_READONLY:-}" == "true" ]]; then
  info "Configuring UEFI variables as read-only for snapshot creation..."
  
  # Find and replace the pflash unit=1 argument to add readonly=on
  # The ARGS variable contains all QEMU arguments
  
  # Replace: -drive file=/storage/windows.vars,if=pflash,unit=1,format=raw
  # With:    -drive file=/storage/windows.vars,if=pflash,unit=1,format=raw,readonly=on
  
  ARGS="${ARGS//,if=pflash,unit=1,format=raw/,if=pflash,unit=1,format=raw,readonly=on}"
  
  info "UEFI variables configured as read-only"
fi

return 0

