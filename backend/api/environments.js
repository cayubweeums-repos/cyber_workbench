const EnvironmentService = require('../services/EnvironmentService');

// Store build state reference (passed from server)
let buildState = null;

function setBuildState(state) {
  buildState = state;
}

/**
 * List all environments
 */
async function listEnvironments(req, res) {
  try {
    const environments = await EnvironmentService.listEnvironments();
    res.json({ success: true, environments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Get environment by ID
 */
async function getEnvironment(req, res) {
  try {
    const { envId } = req.params;
    const environment = await EnvironmentService.getEnvironmentStatus(envId);
    if (!environment) {
      return res.status(404).json({ success: false, error: 'Environment not found' });
    }
    res.json({ success: true, environment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Create a new environment
 */
async function createEnvironment(req, res) {
  try {
    if (!buildState) {
      return res.status(500).json({ success: false, error: 'Build state not initialized' });
    }
    
    const envData = req.body;
    const environment = await EnvironmentService.createEnvironment(envData, buildState);
    res.json({ success: true, environment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Start an environment
 */
async function startEnvironment(req, res) {
  try {
    const { envId } = req.params;
    const environment = await EnvironmentService.startEnvironment(envId);
    res.json({ success: true, environment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Stop an environment
 */
async function stopEnvironment(req, res) {
  try {
    const { envId } = req.params;
    const environment = await EnvironmentService.stopEnvironment(envId);
    res.json({ success: true, environment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Delete an environment
 */
async function deleteEnvironment(req, res) {
  try {
    const { envId } = req.params;
    const result = await EnvironmentService.deleteEnvironment(envId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Get environment status
 */
async function getEnvironmentStatus(req, res) {
  try {
    const { envId } = req.params;
    const environment = await EnvironmentService.getEnvironmentStatus(envId);
    if (!environment) {
      return res.status(404).json({ success: false, error: 'Environment not found' });
    }
    res.json({ success: true, environment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  setBuildState,
  listEnvironments,
  getEnvironment,
  createEnvironment,
  startEnvironment,
  stopEnvironment,
  deleteEnvironment,
  getEnvironmentStatus
};

