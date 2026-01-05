#!/usr/bin/env bash
set -Eeuo pipefail

# Add QGA API proxy location to nginx configuration
# This script is called from server.sh after nginx config is created

if [[ "$QGA_ENABLE" == [Yy1]* ]] && [[ "${WEB:-}" != [Nn]* ]]; then

  # Add API proxy location before the closing brace
  sed -i '/^}$/i \    location /api/ {\n      proxy_http_version 1.1;\n      proxy_set_header Host $host;\n      proxy_set_header X-Real-IP $remote_addr;\n      proxy_buffering off;\n      proxy_read_timeout 3600s;\n      proxy_send_timeout 3600s;\n      proxy_pass http://127.0.0.1:8007/api/;\n    }\n' /etc/nginx/sites-enabled/web.conf

  # Reload nginx to apply changes
  nginx -s reload 2>/dev/null || true

fi

return 0

