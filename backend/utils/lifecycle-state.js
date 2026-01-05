const fs = require('fs/promises');
const path = require('path');
const { getVmStoragePath } = require('./config');

const STATE_FILENAME = 'lifecycle_state.json';

function parseContainerName(containerName) {
  const clean = String(containerName || '').replace(/^\//, '');
  const parts = clean.split('_').filter(Boolean);
  if (parts.length < 2) return null;
  return {
    containerName: clean,
    osType: parts[0],
    vmName: parts.slice(1).join('_'),
  };
}

function getStateFilePath(containerName) {
  const parsed = parseContainerName(containerName);
  if (!parsed) return null;
  const storagePath = getVmStoragePath(parsed.osType, parsed.vmName);
  return path.join(storagePath, STATE_FILENAME);
}

async function readLifecycleState(containerName) {
  const statePath = getStateFilePath(containerName);
  if (!statePath) return null;

  try {
    const raw = await fs.readFile(statePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    console.warn(`[LifecycleState] Failed to read ${STATE_FILENAME} for ${containerName}: ${e.message}`);
    return null;
  }
}

async function writeLifecycleState(containerName, state) {
  const statePath = getStateFilePath(containerName);
  if (!statePath) return;

  try {
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  } catch (e) {
    console.warn(`[LifecycleState] Failed to write ${STATE_FILENAME} for ${containerName}: ${e.message}`);
  }
}

/**
 * Desktop countdown start time is persisted because:
 * - Docker labels are immutable for running containers (can't update timestamps).
 * - vm-manager restarts must not reset the countdown start time.
 *
 * Behavior:
 * - If the state file exists but runId doesn't match the current container runId, ignore it.
 * - If desktopCountdownStartedAt exists for this runId, return it.
 * - If it does not exist and desktopReady is true, set it to now and persist immediately.
 */
async function getOrStartDesktopCountdown(containerName, runId, desktopReady) {
  if (!runId) return null;

  const state = await readLifecycleState(containerName);
  if (state && state.runId === runId && typeof state.desktopCountdownStartedAt === 'number') {
    return state.desktopCountdownStartedAt;
  }

  if (!desktopReady) {
    // Desktop not ready yet (or unknown) - countdown stays paused.
    return null;
  }

  const now = Date.now();
  await writeLifecycleState(containerName, {
    runId,
    desktopCountdownStartedAt: now,
  });
  return now;
}

module.exports = {
  STATE_FILENAME,
  parseContainerName,
  getStateFilePath,
  readLifecycleState,
  writeLifecycleState,
  getOrStartDesktopCountdown,
};


