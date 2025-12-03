/**
 * nginx Management - Start/stop nginx for noVNC serving
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const NGINX_CONFIG = path.join(__dirname, '..', '..', 'nginx', 'novnc.conf');
const NGINX_CONFIG_TEMPLATE = path.join(__dirname, '..', '..', 'nginx', 'novnc.conf.template');
const NGINX_PID_FILE = path.join(__dirname, '..', '..', 'nginx', 'nginx.pid');
const REPO_ROOT = path.join(__dirname, '..', '..');
const NOVNC_DIR = path.join(REPO_ROOT, 'novnc');
// Don't require vm-tracker here to avoid circular dependency
// It will be passed as a parameter when needed

/**
 * Check if nginx is installed
 */
function isNginxInstalled() {
  return new Promise((resolve) => {
    exec('which nginx', (error) => {
      resolve(!error);
    });
  });
}

/**
 * Check if nginx is running
 */
function isNginxRunning() {
  return new Promise((resolve) => {
    // First check if PID file exists
    if (!fs.existsSync(NGINX_PID_FILE)) {
      // Also check if nginx is listening on port 8006
      exec('lsof -ti:8006 2>/dev/null', (error) => {
        resolve(!error);
      });
      return;
    }
    
    try {
      const pid = fs.readFileSync(NGINX_PID_FILE, 'utf8').trim();
      if (!pid) {
        resolve(false);
        return;
      }
      exec(`kill -0 ${pid} 2>/dev/null`, (error) => {
        resolve(!error);
      });
    } catch (e) {
      // If we can't read the PID file, check port instead
      exec('lsof -ti:8006 2>/dev/null', (error) => {
        resolve(!error);
      });
    }
  });
}

/**
 * Get template config (create if doesn't exist)
 */
function getTemplateConfig() {
  if (!fs.existsSync(NGINX_CONFIG_TEMPLATE)) {
    // Template should exist - if not, create it from the base template
    // This should only happen on first run
    const templateDir = path.dirname(NGINX_CONFIG_TEMPLATE);
    if (!fs.existsSync(templateDir)) {
      fs.mkdirSync(templateDir, { recursive: true });
    }
    
    // If we have a current config, clean it and use as template
    if (fs.existsSync(NGINX_CONFIG)) {
      // Read current config and remove any dynamic VM routes
      let currentConfig = fs.readFileSync(NGINX_CONFIG, 'utf8');
      // Remove any location /websockify/ blocks (these are dynamically added)
      currentConfig = currentConfig.replace(/\s*# WebSocket proxy for VM:.*?\n\s*location \/websockify\/.*?\{[^}]*\}\n/g, '');
      fs.writeFileSync(NGINX_CONFIG_TEMPLATE, currentConfig, 'utf8');
    } else {
      // Create minimal template
      const minimalTemplate = `events {
    worker_connections 1024;
}

http {
    map $http_upgrade $connection_upgrade {
        default upgrade;
        '' close;
    }
    server {
        listen 8006;
        server_name localhost;
        access_log logs/access.log;
        error_log logs/error.log;
        root NOVNC_PATH_PLACEHOLDER;
        index vnc.html;
        location / {
            try_files $uri $uri/ /vnc.html;
            types {
                text/html html;
                text/css css;
                application/javascript js;
            }
            add_header Access-Control-Allow-Origin *;
        }
    }
}
`;
      fs.writeFileSync(NGINX_CONFIG_TEMPLATE, minimalTemplate, 'utf8');
    }
  }
  return fs.readFileSync(NGINX_CONFIG_TEMPLATE, 'utf8');
}

/**
 * Update nginx config with correct paths and VM routes
 * Uses a temporary file to avoid race conditions
 */
async function updateNginxConfig(vmTracker = null) {
  // Get template
  let config = getTemplateConfig();
  
  // Update root path placeholder with actual repo path
  config = config.replace(
    /NOVNC_PATH_PLACEHOLDER/g,
    NOVNC_DIR
  );
  
  // Get all running VMs and their websockify ports
  // vmTracker is passed as parameter to avoid circular dependency
  let runningVMs = {};
  if (vmTracker) {
    runningVMs = await vmTracker.getRunningVMs();
  } else {
    // Fallback: try to require it dynamically if not passed
    try {
      const tracker = require('./vm-tracker');
      runningVMs = await tracker.getRunningVMs();
    } catch (e) {
      console.warn('Could not get running VMs for nginx config:', e.message);
    }
  }
  
  // Generate location blocks for each VM's websockify
  // Format: /websockify/{vmname} -> proxies to websockify port
  let vmLocationBlocks = '';
  for (const [vmName, vmData] of Object.entries(runningVMs)) {
    const websockifyPort = vmData.websockifyPort;
    vmLocationBlocks += `
    # WebSocket proxy for VM: ${vmName}
    location /websockify/${vmName} {
        proxy_pass http://127.0.0.1:${websockifyPort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_connect_timeout 3600s;
        proxy_buffering off;
    }
`;
  }
  
  // Insert VM location blocks at the marker in the template
  // Replace the INSERT_VM_ROUTES_HERE marker with actual VM routes
  if (config.includes('INSERT_VM_ROUTES_HERE')) {
    config = config.replace('INSERT_VM_ROUTES_HERE', vmLocationBlocks.trim());
  } else {
    // Fallback: find location / block and insert after it, before server closing
    // Look for the closing of location / block
    const locationCloseMatch = config.match(/(\s+)\}\s*\n(\s+)\}\s*$/m);
    if (locationCloseMatch) {
      const locationIndent = locationCloseMatch[1];
      const serverIndent = locationCloseMatch[2];
      config = config.replace(
        /(\s+)\}\s*\n(\s+)\}\s*$/m,
        locationIndent + '}\n' + vmLocationBlocks + serverIndent + '}\n}'
      );
    } else {
      // Last resort: insert before server closing brace
      config = config.replace(/(\s+)\}\s*\n\}\s*$/, vmLocationBlocks + '$1}\n}');
    }
  }
  
  // Write to temporary file first, then atomically replace
  const tempConfig = NGINX_CONFIG + '.tmp';
  fs.writeFileSync(tempConfig, config, 'utf8');
  
  // Atomically replace the original config
  fs.renameSync(tempConfig, NGINX_CONFIG);
}

/**
 * Update nginx config for a specific VM (called when VM starts websockify)
 * This updates the config with all running VMs and reloads nginx
 */
async function updateNginxConfigForVM(vmName, websockifyPort, vmTracker = null) {
  // Update config with all running VMs (including the newly registered one)
  await updateNginxConfig(vmTracker);
  
  // Reload nginx to apply changes
  if (await isNginxRunning()) {
    try {
      await reloadNginx();
      console.log(`nginx config updated for VM ${vmName} (websockify port ${websockifyPort})`);
    } catch (error) {
      console.warn(`Failed to reload nginx after adding VM ${vmName}: ${error.message}`);
      // Don't throw - config update succeeded, reload can be done manually
    }
  }
}

/**
 * Start nginx
 */
async function startNginx() {
  if (!await isNginxInstalled()) {
    throw new Error('nginx is not installed. Install with: brew install nginx (macOS)');
  }

  if (await isNginxRunning()) {
    console.log('nginx is already running');
    return true;
  }

  if (!fs.existsSync(NGINX_CONFIG)) {
    throw new Error(`nginx config not found: ${NGINX_CONFIG}`);
  }

  // Check if novnc directory exists
  if (!fs.existsSync(NOVNC_DIR)) {
    throw new Error(`noVNC directory not found: ${NOVNC_DIR}. Run 'make setup-novnc' to download noVNC.`);
  }

  // Update config with correct paths and any existing running VMs
  // Don't require vm-tracker here to avoid circular dependency
  try {
    const tracker = require('./vm-tracker');
    await updateNginxConfig(tracker);
  } catch (error) {
    console.warn('Failed to update nginx config with VM routes:', error.message);
    // Fallback: just update the path placeholder
    let config = getTemplateConfig();
    config = config.replace(/NOVNC_PATH_PLACEHOLDER/g, NOVNC_DIR);
    const tempConfig = NGINX_CONFIG + '.tmp';
    fs.writeFileSync(tempConfig, config, 'utf8');
    fs.renameSync(tempConfig, NGINX_CONFIG);
  }

  return new Promise((resolve, reject) => {
    const nginxDir = path.dirname(NGINX_CONFIG);
    
    // Check if port 8006 is already in use
    exec('lsof -ti:8006 2>/dev/null', (portError) => {
      if (!portError) {
        // Port is in use - check if it's our nginx
        isNginxRunning().then((running) => {
          if (running) {
            console.log('nginx is already running on port 8006');
            resolve(true);
          } else {
            reject(new Error('Port 8006 is already in use by another process'));
          }
        });
        return;
      }
      
      // Port is free, proceed with starting nginx
      // Test nginx config first (with -p flag for proper path resolution)
      exec(`nginx -t -c ${NGINX_CONFIG} -p ${nginxDir}`, (error, stdout, stderr) => {
        if (error) {
          console.error('nginx config test failed:', stderr);
          reject(new Error(`nginx config test failed: ${stderr}`));
          return;
        }

        // Start nginx in background
        // Use -g to set PID file location explicitly (relative to -p directory)
        const pidFileRelative = path.relative(nginxDir, NGINX_PID_FILE);
        const nginx = spawn('nginx', [
          '-c', NGINX_CONFIG,
          '-p', nginxDir,
          '-g', `pid ${pidFileRelative};`
        ], {
          stdio: 'pipe',
          detached: true,
          cwd: nginxDir
        });

        nginx.unref(); // Allow parent process to exit

        let errorOutput = '';
        nginx.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        nginx.on('error', (err) => {
          errorOutput += err.message;
        });

        // Wait a moment and check if nginx started successfully
        setTimeout(() => {
          isNginxRunning().then((running) => {
            if (running) {
              console.log('nginx started successfully on port 8006');
              resolve(true);
            } else {
              reject(new Error(`nginx failed to start: ${errorOutput || 'Process exited immediately'}`));
            }
          });
        }, 1500);
      });
    });
  });
}

/**
 * Stop nginx
 */
async function stopNginx() {
  if (!await isNginxRunning()) {
    console.log('nginx is not running');
    return true;
  }

  return new Promise((resolve, reject) => {
    const nginxDir = path.dirname(NGINX_CONFIG);
    exec(`nginx -s quit -c ${NGINX_CONFIG} -p ${nginxDir}`, (error) => {
      if (error) {
        // Try force kill if quit doesn't work
        if (fs.existsSync(NGINX_PID_FILE)) {
          const pid = fs.readFileSync(NGINX_PID_FILE, 'utf8').trim();
          exec(`kill ${pid}`, (killError) => {
            if (killError) {
              reject(new Error(`Failed to stop nginx: ${killError.message}`));
            } else {
              console.log('nginx stopped');
              resolve(true);
            }
          });
        } else {
          resolve(true);
        }
      } else {
        console.log('nginx stopped');
        resolve(true);
      }
    });
  });
}

/**
 * Reload nginx config
 */
async function reloadNginx() {
  if (!await isNginxRunning()) {
    return startNginx();
  }

  return new Promise((resolve, reject) => {
    const nginxDir = path.dirname(NGINX_CONFIG);
    exec(`nginx -s reload -c ${NGINX_CONFIG} -p ${nginxDir}`, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`nginx reload failed: ${stderr}`));
      } else {
        console.log('nginx reloaded');
        resolve(true);
      }
    });
  });
}

module.exports = {
  isNginxInstalled,
  isNginxRunning,
  startNginx,
  stopNginx,
  reloadNginx,
  updateNginxConfig,
  updateNginxConfigForVM
};

