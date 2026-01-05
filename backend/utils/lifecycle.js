const { listContainers, getContainer } = require('./docker');
const { removeDefaultVmNetwork, removeLegacySandboxNetwork } = require('./network');
const { checkDesktopReady } = require('./qga-readiness');
const crypto = require('crypto');
const { getQgaHealth, getDesktopReady } = require('./qga-readiness');
const { getOrStartDesktopCountdown } = require('./lifecycle-state');

// Environment configuration
const DEFAULT_TIME_LIMIT = parseInt(process.env.VM_DEFAULT_TIME_LIMIT || '3600', 10); // 1 hour
const MAX_TIME_LIMIT = parseInt(process.env.VM_MAX_TIME_LIMIT || '14400', 10); // 4 hours
const CLEANUP_PRESERVE_STORAGE = process.env.VM_CLEANUP_PRESERVE_STORAGE === 'true';
const CHECK_INTERVAL = 30000; // 30 seconds

let lifecycleTimer = null;

// In-memory storage for time limit extensions (Docker can't update labels on running containers)
const timeExtensions = new Map(); // containerName -> { originalTimeLimit, totalExtension, newTimeLimit }

/**
 * Get VM lifecycle metadata from container labels
 * Also checks for time extensions stored in memory
 * timeLimit: 0 = persistent/infinite VM (no auto-cleanup)
 */
async function getLifecycleMetadata(container, opts = {}) {
  const labels = container.Labels || {};
  
  const startedAt = parseInt(labels['vapiorc.startedAt'] || '0', 10);
  let timeLimit = parseInt(labels['vapiorc.timeLimit'] || DEFAULT_TIME_LIMIT.toString(), 10);
  const maxTimeLimit = parseInt(labels['vapiorc.maxTimeLimit'] || MAX_TIME_LIMIT.toString(), 10);
  const isPersistent = timeLimit === 0; // 0 = persistent/infinite VM
  
  if (!startedAt) return null;
  
  // Check for time extensions stored in memory (not applicable for persistent VMs)
  const containerName = container.Name?.replace('/', '') || container.Names?.[0]?.replace('/', '');
  if (!isPersistent && containerName && timeExtensions.has(containerName)) {
    const extension = timeExtensions.get(containerName);
    timeLimit = extension.newTimeLimit;
  }

  // Per-run lifecycle tracking:
  // - Labels are immutable for running containers, so we can't "set countdown start time" in Docker metadata.
  // - We persist countdown start time to the VM's storage directory keyed by a per-run ID label.
  //
  // NOTE: For older containers that predate this label, we fall back to startedAt as a stable run identifier
  // (but we still do NOT use startedAt as the countdown start time).
  const lifecycleRunId = labels['vapiorc.lifecycleRunId'] || (startedAt ? String(startedAt) : null);
  const desktopReady = Boolean(opts.desktopReady);

  let countdownStartedAt = null;
  let countdownActive = false;

  if (!isPersistent && containerName) {
    countdownStartedAt = await getOrStartDesktopCountdown(containerName, lifecycleRunId, desktopReady);
    countdownActive = typeof countdownStartedAt === 'number';
  }

  const now = Date.now();
  const elapsed = (isPersistent || !countdownActive)
    ? 0
    : Math.floor((now - countdownStartedAt) / 1000);
  const remaining = isPersistent
    ? Infinity
    : (!countdownActive ? timeLimit : Math.max(0, timeLimit - elapsed));
  const maxExtension = isPersistent ? 0 : Math.max(0, maxTimeLimit - timeLimit);

  return {
    startedAt,
    lifecycleRunId,
    timeLimit,
    maxTimeLimit,
    elapsed,
    remaining,
    maxExtension,
    expired: isPersistent ? false : (countdownActive ? (remaining === 0) : false),
    isPersistent,
    countdownActive,
    countdownStartedAt: countdownActive ? countdownStartedAt : null,
  };
}

async function probeDesktopReadyForLifecycle(container) {
  // Keep these timeouts conservative: this runs in the background cleanup loop and must not hang.
  const qga = await getQgaHealth(container, { curlMaxTimeSec: 5, execTimeoutMs: 8000 });
  if (!qga.qgaReady) return false;

  const desktop = await getDesktopReady(container, { curlMaxTimeSec: 5, execTimeoutMs: 8000 });
  return desktop.desktopReady === true;
}

/**
 * Clean up expired VMs
 */
async function cleanupExpiredVMs() {
  try {
    const containers = await listContainers({ all: false });
    const windowsContainers = containers.filter(c => 
      c.Names.some(name => name.match(/\/win\d+_/))
    );
    
    for (const containerInfo of windowsContainers) {
      const containerName = containerInfo.Names[0].replace('/', '');

      // We only need the expensive desktopReady probe for timed VMs.
      const labels = containerInfo.Labels || {};
      const rawTimeLimit = parseInt(labels['vapiorc.timeLimit'] || DEFAULT_TIME_LIMIT.toString(), 10);
      const isPersistent = rawTimeLimit === 0;

      let desktopReady = false;
      if (!isPersistent) {
        try {
          const container = getContainer(containerName);
          desktopReady = await probeDesktopReadyForLifecycle(container);
        } catch (_) {
          desktopReady = false;
        }
      }

      const metadata = await getLifecycleMetadata(containerInfo, { desktopReady });
      
      if (metadata && metadata.expired) {
        console.log(`[Lifecycle] VM ${containerName} expired (${metadata.elapsed}s / ${metadata.timeLimit}s), cleaning up...`);
        
        try {
          // Extract OS type and VM name from container name
          const parts = containerName.split('_');
          const osType = parts[0];
          const vmName = parts.slice(1).join('_');
          
          const container = getContainer(containerName);
          await container.stop();
          await container.remove();
          console.log(`[Lifecycle] VM ${containerName} cleaned up successfully`);
          
          // Remove per-VM networks (best-effort; only auto-created default networks are eligible)
          await removeDefaultVmNetwork(containerName);
          await removeLegacySandboxNetwork(containerName);
          
          // Clean up time extension data
          timeExtensions.delete(containerName);
          
          // Emit metrics
          const metrics = require('./metrics');
          metrics.incrementCleanup(osType, vmName, 'timeout');
          metrics.recordLifetime(osType, vmName, metadata.elapsed);
          metrics.incrementStops(osType, vmName);
        } catch (error) {
          console.error(`[Lifecycle] Error cleaning up ${containerName}:`, error.message);
        }
      }
    }
  } catch (error) {
    console.error('[Lifecycle] Error in cleanup check:', error);
  }
}

/**
 * Start lifecycle management background task
 */
function startLifecycleManager() {
  if (lifecycleTimer) {
    console.log('[Lifecycle] Manager already running');
    return;
  }
  
  console.log(`[Lifecycle] Starting manager (check interval: ${CHECK_INTERVAL}ms)`);
  console.log(`[Lifecycle] Default time limit: ${DEFAULT_TIME_LIMIT}s, Max: ${MAX_TIME_LIMIT}s`);
  
  lifecycleTimer = setInterval(cleanupExpiredVMs, CHECK_INTERVAL);
  
  // Run initial check after 30 seconds
  setTimeout(cleanupExpiredVMs, 30000);
}

/**
 * Stop lifecycle management background task
 */
function stopLifecycleManager() {
  if (lifecycleTimer) {
    clearInterval(lifecycleTimer);
    lifecycleTimer = null;
    console.log('[Lifecycle] Manager stopped');
  }
}

/**
 * Extend VM time limit
 */
async function extendVMTime(containerName, additionalSeconds) {
  try {
    const container = getContainer(containerName);
    const info = await container.inspect();
    
    // Extract labels from the correct location in inspect result
    const containerInfo = {
      Labels: info.Config?.Labels || {},
      Name: `/${containerName}`,
    };
    
    // Check desktop readiness to get accurate elapsed time for extension calculation
    let desktopReady = false;
    if (info.State?.Running) {
      try {
        const desktop = await getDesktopReady(container);
        desktopReady = desktop.desktopReady;
      } catch (e) {
        // If check fails, assume not ready (safe default)
        console.warn(`[Lifecycle] Could not check desktop readiness for ${containerName}: ${e.message}`);
      }
    }
    
    const metadata = await getLifecycleMetadata(containerInfo, { desktopReady });
    if (!metadata) {
      throw new Error('VM does not have lifecycle metadata');
    }
    
    // Persistent VMs don't need time extensions
    if (metadata.isPersistent) {
      throw new Error('Cannot extend time for persistent VMs (already infinite)');
    }
    
    // Check if extension is within max limit
    const newTimeLimit = metadata.timeLimit + additionalSeconds;
    const maxAllowed = metadata.maxTimeLimit;
    
    if (newTimeLimit > maxAllowed) {
      throw new Error(`Cannot extend beyond max time limit (${maxAllowed}s)`);
    }
    
    // Store extension in memory (Docker doesn't allow updating labels on running containers)
    const originalTimeLimit = parseInt(info.Config.Labels['vapiorc.timeLimit'], 10);
    const totalExtension = newTimeLimit - originalTimeLimit;
    
    timeExtensions.set(containerName, {
      originalTimeLimit,
      totalExtension,
      newTimeLimit,
    });
    
    console.log(`[Lifecycle] Extended ${containerName} by ${additionalSeconds}s (new limit: ${newTimeLimit}s, total extension: ${totalExtension}s)`);
    
    return {
      success: true,
      newTimeLimit,
      remaining: Math.max(0, newTimeLimit - metadata.elapsed),
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Create lifecycle labels for new VM
 * timeLimit: null = use default, 0 = persistent/infinite (no cleanup), >0 = specific limit
 */
function createLifecycleLabels(timeLimit = null, persistent = false) {
  const lifecycleRunId = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

  // Persistent VMs bypass time limits
  if (persistent) {
    return {
      'vapiorc.startedAt': Date.now().toString(),
      'vapiorc.lifecycleRunId': lifecycleRunId,
      'vapiorc.timeLimit': '0', // 0 = persistent/infinite
      'vapiorc.maxTimeLimit': '0',
    };
  }
  
  const effectiveTimeLimit = timeLimit || DEFAULT_TIME_LIMIT;
  
  // Ensure time limit doesn't exceed max
  const constrainedTimeLimit = Math.min(effectiveTimeLimit, MAX_TIME_LIMIT);
  
  return {
    'vapiorc.startedAt': Date.now().toString(),
    'vapiorc.lifecycleRunId': lifecycleRunId,
    'vapiorc.timeLimit': constrainedTimeLimit.toString(),
    'vapiorc.maxTimeLimit': MAX_TIME_LIMIT.toString(),
  };
}

module.exports = {
  DEFAULT_TIME_LIMIT,
  MAX_TIME_LIMIT,
  CLEANUP_PRESERVE_STORAGE,
  getLifecycleMetadata,
  cleanupExpiredVMs,
  startLifecycleManager,
  stopLifecycleManager,
  extendVMTime,
  createLifecycleLabels,
};

