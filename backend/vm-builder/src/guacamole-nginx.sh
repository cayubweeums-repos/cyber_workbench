#!/usr/bin/env bash
set -Eeuo pipefail

# Add Guacamole proxy to nginx without modifying existing noVNC configuration
# Routes:
#   /        → noVNC web viewer (unchanged, original behavior)
#   /guac    → Guacamole RDP interface (new)

if [[ "$GUACAMOLE_ENABLE" == [Yy1]* ]] && [[ "${WEB:-}" != [Nn]* ]]; then

  # Simply add Guacamole proxy location before the closing brace
  # Don't modify the existing root location that serves noVNC
  sed -i '/^}$/i \    # Guacamole RDP interface\n    location /guac/ {\n      proxy_http_version 1.1;\n      proxy_set_header Host $host;\n      proxy_set_header X-Real-IP $remote_addr;\n      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n      proxy_set_header X-Forwarded-Proto $scheme;\n      \n      # WebSocket support\n      proxy_set_header Upgrade $http_upgrade;\n      proxy_set_header Connection "upgrade";\n      \n      proxy_buffering off;\n      proxy_read_timeout 3600s;\n      proxy_send_timeout 3600s;\n      proxy_connect_timeout 3600s;\n      \n      # Rewrite /guac/ to /guacamole/ for Tomcat\n      rewrite ^/guac/(.*) /guacamole/$1 break;\n      proxy_pass http://127.0.0.1:8080;\n    }\n' /etc/nginx/sites-enabled/web.conf

  # Reload nginx to apply changes
  nginx -s reload 2>/dev/null || true
  
  info "Nginx routing configured:"
  info "  - noVNC viewer: /"
  info "  - Guacamole RDP: /guac/"

fi

return 0
