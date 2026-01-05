const IS_FEDORA = process.env.IS_FEDORA === 'true';

/**
 * Format volume bind with SELinux support
 * Automatically appends :z flag when IS_FEDORA is true
 * 
 * @param {string} hostPath - Path on host system
 * @param {string} containerPath - Path inside container
 * @param {object} options - Additional options { readOnly: boolean }
 * @returns {string} Formatted volume string
 */
function formatVolumeBind(hostPath, containerPath, options = {}) {
  let volumeStr = `${hostPath}:${containerPath}`;
  
  if (options.readOnly) {
    volumeStr += ':ro';
  }
  
  // Append :z for SELinux relabeling if on Fedora/RHEL
  if (IS_FEDORA && !volumeStr.endsWith(':z')) {
    volumeStr += ':z';
  }
  
  return volumeStr;
}

/**
 * Format multiple volume binds
 * 
 * @param {Array} volumes - Array of {hostPath, containerPath, options} objects
 * @returns {Array} Array of formatted volume strings
 */
function formatVolumeBinds(volumes) {
  return volumes.map(vol => formatVolumeBind(vol.hostPath, vol.containerPath, vol.options || {}));
}

module.exports = {
  formatVolumeBind,
  formatVolumeBinds,
};

