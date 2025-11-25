/**
 * Progress Tracking for VM Operations
 */

const progressStore = new Map();

/**
 * Set progress for a VM operation
 */
function setProgress(vmName, progress) {
  progressStore.set(vmName, {
    ...progress,
    timestamp: Date.now()
  });
}

/**
 * Get progress for a VM operation
 */
function getProgress(vmName) {
  return progressStore.get(vmName) || null;
}

/**
 * Clear progress for a VM
 */
function clearProgress(vmName) {
  progressStore.delete(vmName);
}

/**
 * Get all active progress
 */
function getAllProgress() {
  return Object.fromEntries(progressStore);
}

module.exports = {
  setProgress,
  getProgress,
  clearProgress,
  getAllProgress
};

