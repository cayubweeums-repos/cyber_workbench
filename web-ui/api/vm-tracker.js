/**
 * VM Tracker - Tracks running VMs and their websockify ports
 * Express handles noVNC serving and WebSocket proxying automatically
 */

const { isVMRunning } = require('./python-bridge');
const fs = require('fs');
const path = require('path');

const TRACKER_FILE = path.join(__dirname, '..', '..', 'data', 'vm-tracker.json');

/**
 * Get all running VMs
 */
async function getRunningVMs() {
  return new Promise(async (resolve) => {
    try {
      // Read tracked VMs from file
      let trackedVMs = {};
      if (fs.existsSync(TRACKER_FILE)) {
        try {
          trackedVMs = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
        } catch (e) {
          // File corrupted, start fresh
          trackedVMs = {};
        }
      }

      // Verify which VMs are actually still running
      const runningVMs = {};
      for (const [vmName, data] of Object.entries(trackedVMs)) {
        const isRunning = await isVMRunning(vmName);
        if (isRunning) {
          runningVMs[vmName] = data;
        }
      }

      // Update tracker file
      if (Object.keys(runningVMs).length !== Object.keys(trackedVMs).length) {
        saveRunningVMs(runningVMs);
      }

      resolve(runningVMs);
    } catch (error) {
      console.error('Error getting running VMs:', error);
      resolve({});
    }
  });
}

/**
 * Save running VMs to tracker file
 */
function saveRunningVMs(vms) {
  try {
    const dir = path.dirname(TRACKER_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(vms, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving running VMs:', error);
  }
}

/**
 * Register a VM as running
 */
async function registerVM(vmName, websockifyPort) {
  const runningVMs = await getRunningVMs();
  runningVMs[vmName] = {
    websockifyPort,
    registeredAt: new Date().toISOString()
  };
  saveRunningVMs(runningVMs);
  
  // No nginx needed - Express handles everything!
}

/**
 * Unregister a VM (when it stops)
 */
async function unregisterVM(vmName) {
  const runningVMs = await getRunningVMs();
  delete runningVMs[vmName];
  saveRunningVMs(runningVMs);
  
  // No nginx to manage - Express handles everything automatically!
}

/**
 * Get websockify port for a VM
 */
async function getWebsockifyPort(vmName) {
  const runningVMs = await getRunningVMs();
  return runningVMs[vmName]?.websockifyPort || null;
}

/**
 * Check if any VMs are running
 */
async function hasRunningVMs() {
  const runningVMs = await getRunningVMs();
  return Object.keys(runningVMs).length > 0;
}

/**
 * Clean up stale VM entries (VMs that are no longer running)
 * Called on server startup to ensure tracker is in sync
 */
async function cleanupStaleVMs() {
  try {
    const runningVMs = await getRunningVMs();
    // getRunningVMs already verifies and removes stale entries
    // This function is mainly for explicit cleanup if needed
    return runningVMs;
  } catch (error) {
    console.error('Error cleaning up stale VMs:', error);
    return {};
  }
}

module.exports = {
  getRunningVMs,
  registerVM,
  unregisterVM,
  getWebsockifyPort,
  hasRunningVMs,
  cleanupStaleVMs
};

