#!/usr/bin/env bash
set -Eeuo pipefail

# Initialize Guacamole if enabled
: "${GUACAMOLE_ENABLE:="Y"}"
: "${USERNAME:="Docker"}"
: "${PASSWORD:="password"}"

if [[ "$GUACAMOLE_ENABLE" != [Yy1]* ]]; then
  return 0
fi

info "Configuring Guacamole..."

# Create recordings directory for recording storage extension
# Use /recordings (mounted from host) as the search path
# This matches RECORDING_SEARCH_PATH=/recordings environment variable
RECORDING_SEARCH_PATH="${RECORDING_SEARCH_PATH:-/recordings}"
mkdir -p "${RECORDING_SEARCH_PATH}"
# Set permissions: Ensure both guacd and tomcat can access
# guacd writes recordings, tomcat (webapp) reads them for playback
chmod 755 "${RECORDING_SEARCH_PATH}"
# Set umask so recorded files are readable (022 = rw-r--r--)
umask 022

# Detect Windows VM IP address from dnsmasq DHCP lease
# The VM gets its IP via DHCP on the internal docker bridge
WINDOWS_IP=""

# Wait up to 30 seconds for DHCP lease to appear
for i in {1..30}; do
  if [ -f /var/lib/misc/dnsmasq.leases ]; then
    WINDOWS_IP=$(grep -i "Windows" /var/lib/misc/dnsmasq.leases | awk '{print $3}' | head -1 || echo "")
    if [ -n "$WINDOWS_IP" ]; then
      info "Detected Windows VM IP from DHCP lease: $WINDOWS_IP"
      break
    fi
  fi
  sleep 1
done

# Fallback: Try to detect from docker bridge
if [ -z "$WINDOWS_IP" ]; then
  WINDOWS_IP=$(ip -4 addr show docker 2>/dev/null | grep "inet " | awk '{print $2}' | cut -d/ -f1 | sed 's/\.1$/.2/' || echo "")
  if [ -n "$WINDOWS_IP" ]; then
    info "Using estimated Windows VM IP from docker bridge: $WINDOWS_IP"
  fi
fi

# Final fallback
if [ -z "$WINDOWS_IP" ]; then
  WINDOWS_IP="172.30.0.2"  # Default based on dnsmasq configuration
  info "Using default Windows VM IP: $WINDOWS_IP"
fi

# Get container's IP address
CONTAINER_IP=$(ip -4 addr show eth0 2>/dev/null | grep "inet " | awk '{print $2}' | cut -d/ -f1 || echo "172.19.0.2")

info "Final Windows VM IP: ${WINDOWS_IP}"

# Generate noauth-config.xml for NoAuth extension (no login required)
cat > /etc/guacamole/noauth-config.xml << EOF
<?xml version="1.0" encoding="UTF-8"?>
<configs>
    <config name="Windows ${VERSION}" protocol="rdp">
        <param name="hostname" value="${WINDOWS_IP}" />
        <param name="port" value="3389" />
        <param name="username" value="${USERNAME}" />
        <param name="password" value="${PASSWORD}" />
        <param name="security" value="any" />
        <param name="ignore-cert" value="true" />
        
        <!-- Clipboard Support (bidirectional) -->
        <param name="disable-copy" value="false" />
        <param name="disable-paste" value="false" />
        
        <!-- SFTP File System Access (full C:\ browsing via Guacamole menu) -->
        <param name="enable-sftp" value="true" />
        <param name="sftp-hostname" value="${WINDOWS_IP}" />
        <param name="sftp-port" value="22" />
        <param name="sftp-username" value="${USERNAME}" />
        <param name="sftp-password" value="${PASSWORD}" />
        <param name="sftp-root-directory" value="/" />
        <param name="sftp-directory" value="C:\\" />
        
        <!-- Visual Quality Settings (all enabled for full experience) -->
        <param name="enable-wallpaper" value="true" />
        <param name="enable-theming" value="true" />
        <param name="enable-font-smoothing" value="true" />
        <param name="enable-full-window-drag" value="true" />
        <param name="enable-desktop-composition" value="true" />
        <param name="enable-menu-animations" value="true" />
        
        <!-- Display Settings -->
        <param name="color-depth" value="32" />
        <param name="resize-method" value="display-update" />
        <param name="force-lossless" value="false" />
        
        <!-- Audio Support (bidirectional) -->
        <param name="enable-audio" value="true" />
        <param name="enable-audio-input" value="true" />
        
        <!-- Printing Support -->
        <param name="enable-printing" value="true" />
        <param name="printer-name" value="Guacamole Printer" />
        
        <!-- Static Channels (additional device redirection) -->
        <param name="static-channels" value="" />
        
        <!-- Gateway Settings (for RD Gateway if needed) -->
        <param name="gateway-hostname" value="" />
        <param name="gateway-port" value="" />
        
        <!-- Multi-touch and gestures -->
        <param name="enable-touch" value="true" />
        
        <!-- Console/Admin session -->
        <param name="console" value="false" />
        
        <!-- Pre-connection PDU/Blob -->
        <param name="preconnection-id" value="" />
        <param name="preconnection-blob" value="" />
        
        <!-- Load balancing info -->
        <param name="load-balance-info" value="" />
        
        <!-- RemoteApp settings -->
        <param name="remote-app" value="" />
        <param name="remote-app-dir" value="" />
        <param name="remote-app-args" value="" />
        
        <!-- Keyboard/Input Settings -->
        <param name="server-layout" value="en-us-qwerty" />
        <param name="timezone" value="America/New_York" />
        <param name="enable-sftp" value="false" />
        
        <!-- Connection Sharing -->
        <param name="read-only" value="false" />
        
        <!-- Session Recording -->
        <!-- NOTE: Recording storage extension requires database backend for HISTORY_UUID tokens -->
        <!-- Since we use NoAuth (no database), we use a simple path that works for our custom player -->
        <!-- Our custom JavaScript player (player.js) handles playback without needing UUIDs -->
        <param name="recording-path" value="/recordings" />
        <param name="create-recording-path" value="true" />
        <param name="recording-name" value="${CONTAINER_NAME}_session-\${GUAC_DATE}-\${GUAC_TIME}" />
        <param name="recording-width" value="1920" />
        <param name="recording-height" value="1080" />
        <param name="recording-exclude-output" value="false" />
        <param name="recording-exclude-mouse" value="false" />
        <param name="recording-include-keys" value="true" />
    </config>
</configs>
EOF

# Set proper permissions
chmod 644 /etc/guacamole/noauth-config.xml
chmod 755 /guac-transfer

# Start guacd daemon
info "Starting guacd daemon..."
/usr/local/sbin/guacd -b 0.0.0.0 -l 4822 -L info >/var/log/guacamole/guacd.log 2>&1 &
echo $! > /var/run/guacd.pid

# Wait a moment for guacd to start
sleep 2

# Start Tomcat
info "Starting Tomcat for Guacamole web app..."
export GUACAMOLE_HOME=/etc/guacamole
export CATALINA_HOME=/opt/tomcat
export CATALINA_PID=/var/run/tomcat.pid
export CATALINA_OPTS="-Xms512m -Xmx1024m"
export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which java))))

# Start Tomcat in background
/opt/tomcat/bin/catalina.sh start >/var/log/guacamole/tomcat.log 2>&1

  info "Guacamole configuration complete!"
  info "Guacamole RDP: /guac/ (no login required)"
  info "noVNC viewer: / (or /novnc/ depending on image configuration)"
  info "SFTP enabled: Browse full C:\\ drive via Guacamole menu (Ctrl+Alt+Shift)"

return 0
