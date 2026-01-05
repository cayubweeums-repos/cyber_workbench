const Docker = require('dockerode');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/**
 * Get a Docker container instance by name
 */
function getContainer(containerName) {
  return docker.getContainer(containerName);
}

/**
 * List all Docker containers
 */
async function listContainers(options = {}) {
  return await docker.listContainers(options);
}

/**
 * List Windows VM containers (by naming convention)
 */
async function listWindowsContainers(options = {}) {
  const { all = true } = options;
  const containers = await docker.listContainers({ all });
  return containers.filter(c => c.Names.some(name => name.match(/^\/win\d+_/)));
}

/**
 * Legacy helper: return a single "selected" Windows VM container.
 * Prefer listWindowsContainers() for multi-VM support.
 */
async function findWindowsContainer() {
  const containers = await listWindowsContainers({ all: true });

  // Prefer running containers; if multiple, pick the most recently created.
  const running = containers.filter(c => c.State === 'running');
  if (running.length > 0) {
    running.sort((a, b) => (b.Created || 0) - (a.Created || 0));
    return running[0];
  }

  // Fallback to the most recently created stopped container (useful for debugging).
  containers.sort((a, b) => (b.Created || 0) - (a.Created || 0));
  return containers[0];
}

/**
 * Get Docker image by name
 */
function getImage(imageName) {
  return docker.getImage(imageName);
}

/**
 * Create a new container
 */
async function createContainer(config) {
  return await docker.createContainer(config);
}

/**
 * Get network information from vm-manager's perspective
 */
async function getVmManagerNetwork() {
  const container = docker.getContainer('vm-manager');
  const info = await container.inspect();
  const networks = info.NetworkSettings.Networks;
  const networkName = Object.keys(networks)[0];
  return networks[networkName];
}

module.exports = {
  docker,
  getContainer,
  listContainers,
  listWindowsContainers,
  findWindowsContainer,
  getImage,
  createContainer,
  getVmManagerNetwork
};

