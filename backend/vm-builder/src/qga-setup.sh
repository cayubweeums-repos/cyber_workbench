#!/usr/bin/env bash
set -Eeuo pipefail

# Initialize default value
: "${QGA_ENABLE:="Y"}"
: "${STORAGE:="/storage"}"

# Setup QEMU Guest Agent if enabled
if [[ "$QGA_ENABLE" == [Yy1]* ]]; then

  info "Setting up QEMU Guest Agent..."

  # Create QGA socket directory
  mkdir -p /tmp/qga
  chmod 777 /tmp/qga
  
  # Download QGA installer for Windows if not present
  QGA_MSI="/run/assets/qemu-ga-x86_64.msi"
  if [[ ! -f "$QGA_MSI" ]]; then
    info "Downloading QEMU Guest Agent installer..."
    wget -q "https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/latest-qemu-ga/qemu-ga-x86_64.msi" \
      -O "$QGA_MSI" || echo "Warning: Could not download QGA installer"
  fi
  
  # Create OEM folder for Windows installation
  OEM_DIR="$STORAGE/oem"
  mkdir -p "$OEM_DIR" || true
  
  # Copy QGA installer to OEM folder if available
  if [[ -f "$QGA_MSI" ]]; then
    cp "$QGA_MSI" "$OEM_DIR/" 2>/dev/null || true
  fi
  
  # Create or update install.bat in OEM folder
  INSTALL_BAT="$OEM_DIR/install.bat"
  
  if [[ ! -f "$INSTALL_BAT" ]]; then
    # Create new install.bat with QGA and OpenSSH installation
    cat > "$INSTALL_BAT" << 'EOFBAT'
@echo off
echo Installing QEMU Guest Agent...

if exist "C:\OEM\qemu-ga-x86_64.msi" (
    echo Found QGA installer, installing...
    msiexec /i "C:\OEM\qemu-ga-x86_64.msi" /qn /norestart /L*v "C:\OEM\qga-install.log"
    timeout /t 10 /nobreak > nul
    sc start "QEMU Guest Agent" 2>nul
    sc config "QEMU Guest Agent" start= auto 2>nul
    echo QEMU Guest Agent installation complete
) else (
    echo QGA installer not found, skipping...
)

echo Installing OpenSSH Server for SFTP file access...
powershell -Command "Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0" 2>nul
powershell -Command "Start-Service sshd" 2>nul
powershell -Command "Set-Service -Name sshd -StartupType 'Automatic'" 2>nul
powershell -Command "New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22" 2>nul
echo OpenSSH Server installation complete
EOFBAT
  else
    # Append QGA installation to existing install.bat
    if ! grep -q "qemu-ga-x86_64.msi" "$INSTALL_BAT" 2>/dev/null; then
      cat >> "$INSTALL_BAT" << 'EOFBAT'

echo Installing QEMU Guest Agent...

if exist "C:\OEM\qemu-ga-x86_64.msi" (
    echo Found QGA installer, installing...
    msiexec /i "C:\OEM\qemu-ga-x86_64.msi" /qn /norestart /L*v "C:\OEM\qga-install.log"
    timeout /t 10 /nobreak > nul
    sc start "QEMU Guest Agent" 2>nul
    sc config "QEMU Guest Agent" start= auto 2>nul
    echo QEMU Guest Agent installation complete
) else (
    echo QGA installer not found, skipping...
)
EOFBAT
    fi
    
    # Append OpenSSH installation to existing install.bat
    if ! grep -q "OpenSSH Server" "$INSTALL_BAT" 2>/dev/null; then
      cat >> "$INSTALL_BAT" << 'EOFBAT'

echo Installing OpenSSH Server for SFTP file access...
powershell -Command "Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0" 2>nul
powershell -Command "Start-Service sshd" 2>nul
powershell -Command "Set-Service -Name sshd -StartupType 'Automatic'" 2>nul
powershell -Command "New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22" 2>nul
echo OpenSSH Server installation complete
EOFBAT
    fi
  fi
  
  # Convert to DOS line endings
  unix2dos -q "$INSTALL_BAT" 2>/dev/null || true
  
  info "QGA setup complete"

fi

return 0

