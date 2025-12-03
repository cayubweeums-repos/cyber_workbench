/**
 * Sudo Password Storage Module
 * Stores sudo password in memory for use by operations requiring elevation
 */

let sudoPassword = null;

/**
 * Set sudo password from environment variable or user input
 */
function setSudoPassword(password) {
  if (password) {
    sudoPassword = password;
    console.log('Sudo password set (stored in memory)');
  }
}

/**
 * Get stored sudo password
 */
function getSudoPassword() {
  return sudoPassword;
}

/**
 * Check if sudo password is set
 */
function hasSudoPassword() {
  return sudoPassword !== null;
}

/**
 * Initialize sudo password from environment variable
 */
function initializeFromEnv() {
  const envPassword = process.env.SUDO_PASSWORD;
  if (envPassword) {
    setSudoPassword(envPassword);
    return true;
  }
  return false;
}

module.exports = {
  setSudoPassword,
  getSudoPassword,
  hasSudoPassword,
  initializeFromEnv
};

