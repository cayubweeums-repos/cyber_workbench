#!/usr/bin/env bash
set -Eeuo pipefail

# Create auto-connect HTML page
# This page will auto-login and connect to the Windows RDP session

: "${GUACAMOLE_ENABLE:="Y"}"

if [[ "$GUACAMOLE_ENABLE" != [Yy1]* ]]; then
  return 0
fi

info "Configuring Guacamole auto-connect..."

# Wait for Tomcat to start
sleep 2

# Create Tomcat ROOT webapp directory if it doesn't exist
mkdir -p /opt/tomcat/webapps/ROOT

# Create auto-login redirect page
cat > /opt/tomcat/webapps/ROOT/index.jsp << 'EOF'
<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>
<%
    // Auto-redirect to Guacamole with auto-login
    response.sendRedirect("/guacamole/#/");
%>
EOF

# Also inject auto-login script into Guacamole webapp
# This will auto-fill and submit the login form
cat > /opt/tomcat/webapps/guacamole/auto-login.js << 'EOF'
// Auto-login script for Guacamole
(function() {
    // Wait for page to load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoLogin);
    } else {
        autoLogin();
    }
    
    function autoLogin() {
        // Check if we're on the login page
        const usernameField = document.querySelector('input[name="username"], input[type="text"]');
        const passwordField = document.querySelector('input[name="password"], input[type="password"]');
        const loginButton = document.querySelector('button[type="submit"], input[type="submit"]');
        
        if (usernameField && passwordField && loginButton) {
            // Only auto-login if fields are empty (haven't been filled by user)
            if (!usernameField.value && !passwordField.value) {
                setTimeout(function() {
                    usernameField.value = 'auto';
                    passwordField.value = 'auto';
                    
                    // Trigger input events to ensure validation
                    usernameField.dispatchEvent(new Event('input', { bubbles: true }));
                    passwordField.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    // Submit the form
                    setTimeout(function() {
                        loginButton.click();
                    }, 100);
                }, 500);
            }
        }
    }
})();
EOF

# Inject the auto-login script into the Guacamole index.html
if [ -f /opt/tomcat/webapps/guacamole/index.html ]; then
    # Add script tag before closing body tag
    sed -i 's|</body>|<script src="auto-login.js"></script>\n</body>|' /opt/tomcat/webapps/guacamole/index.html
fi

# Create backup auto-login page
cat > /opt/tomcat/webapps/ROOT/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Connecting to Windows...</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .loader {
            text-align: center;
            color: white;
        }
        .spinner {
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top: 4px solid white;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        h1 {
            font-size: 24px;
            font-weight: 300;
            margin: 0;
        }
        p {
            font-size: 14px;
            opacity: 0.8;
            margin: 10px 0 0;
        }
    </style>
</head>
<body>
    <div class="loader">
        <div class="spinner"></div>
        <h1>Connecting to Windows...</h1>
        <p>Please wait while we establish the connection</p>
    </div>
    <script>
        // Auto-login credentials (matches user-mapping.xml)
        const username = 'auto';
        const password = 'auto';
        
        // Perform auto-login via POST
        fetch('/guacamole/api/tokens', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
        })
        .then(response => response.json())
        .then(data => {
            if (data.authToken) {
                // Store auth token
                const authToken = data.authToken;
                const dataSource = data.dataSource || 'default';
                const username = data.username;
                
                // Get available connections
                return fetch(`/guacamole/api/session/data/${dataSource}/connections?token=${authToken}`)
                    .then(response => response.json())
                    .then(connections => {
                        // Get first connection (should be our Windows connection)
                        const connectionId = Object.keys(connections)[0];
                        if (connectionId) {
                            // Redirect to connection
                            const connectionUrl = `/guacamole/#/client/${connectionId}?token=${authToken}`;
                            window.location.href = connectionUrl;
                        } else {
                            document.body.innerHTML = '<div class="loader"><h1>No connections available</h1><p>Please check Guacamole configuration</p></div>';
                        }
                    });
            } else {
                throw new Error('Authentication failed');
            }
        })
        .catch(error => {
            console.error('Connection error:', error);
            document.body.innerHTML = '<div class="loader"><h1>Connection Failed</h1><p>' + error.message + '</p><p><a href="/guacamole/" style="color: white;">Click here to login manually</a></p></div>';
        });
    </script>
</body>
</html>
EOF

# Also create a redirect at the root nginx level
cat > /var/www/html/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="refresh" content="0; url=/guacamole/" />
    <title>Redirecting to Windows...</title>
</head>
<body>
    <p>Redirecting to Windows connection...</p>
    <p>If not redirected, <a href="/guacamole/">click here</a>.</p>
</body>
</html>
EOF

info "Guacamole auto-connect configured!"
info "Browse to the web viewer root (/) to automatically connect to Windows"

return 0

