/**
 * nginx Management - Start/stop nginx for noVNC serving
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const NGINX_CONFIG = path.join(__dirname, '..', '..', 'nginx', 'novnc.conf');
const NGINX_PID_FILE = path.join(__dirname, '..', '..', 'nginx', 'nginx.pid');
const REPO_ROOT = path.join(__dirname, '..', '..');
const NOVNC_DIR = path.join(REPO_ROOT, 'novnc');

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
    if (!fs.existsSync(NGINX_PID_FILE)) {
      resolve(false);
      return;
    }
    
    const pid = fs.readFileSync(NGINX_PID_FILE, 'utf8').trim();
    exec(`kill -0 ${pid} 2>/dev/null`, (error) => {
      resolve(!error);
    });
  });
}

/**
 * Update nginx config with correct paths
 */
function updateNginxConfig() {
  if (!fs.existsSync(NGINX_CONFIG)) {
    throw new Error(`nginx config not found: ${NGINX_CONFIG}`);
  }

  // Read config
  let config = fs.readFileSync(NGINX_CONFIG, 'utf8');
  
  // Update root path placeholder with actual repo path
  config = config.replace(
    /NOVNC_PATH_PLACEHOLDER/g,
    NOVNC_DIR
  );
  
  // Write updated config
  fs.writeFileSync(NGINX_CONFIG, config, 'utf8');
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

  // Update config with correct paths
  updateNginxConfig();

  return new Promise((resolve, reject) => {
    // Test nginx config first
    exec(`nginx -t -c ${NGINX_CONFIG}`, (error, stdout, stderr) => {
      if (error) {
        console.error('nginx config test failed:', stderr);
        reject(new Error(`nginx config test failed: ${stderr}`));
        return;
      }

      // Start nginx in background
      // Use -g to set pid file location and -c for config file
      const nginxDir = path.dirname(NGINX_CONFIG);
      const nginx = spawn('nginx', [
        '-c', NGINX_CONFIG,
        '-p', nginxDir,
        '-g', `pid ${NGINX_PID_FILE};`
      ], {
        stdio: 'pipe',
        detached: true
      });

      nginx.unref(); // Allow parent process to exit

      let errorOutput = '';
      nginx.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      // Wait a moment and check if nginx started successfully
      setTimeout(() => {
        isNginxRunning().then((running) => {
          if (running) {
            console.log('nginx started successfully');
            resolve(true);
          } else {
            reject(new Error(`nginx failed to start: ${errorOutput || 'Process exited immediately'}`));
          }
        });
      }, 1000);
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
  reloadNginx
};

