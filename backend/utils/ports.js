/**
 * Docker port mapping helpers.
 *
 * Container-internal ports are stable (e.g. 8006/tcp). Host ports are dynamically
 * assigned to support multiple concurrent VMs.
 */

const { getContainer } = require('./docker');

/**
 * Get a published host port for a given container port key (e.g. "8006/tcp").
 */
async function getMappedPort(containerName, containerPortKey) {
  const container = getContainer(containerName);
  const info = await container.inspect();
  return getMappedPortFromInspect(info, containerPortKey, containerName);
}

function getMappedPortFromInspect(inspectInfo, containerPortKey, containerNameForError = 'container') {
  const bindings = inspectInfo?.NetworkSettings?.Ports?.[containerPortKey];
  if (bindings && bindings.length > 0 && bindings[0]?.HostPort) {
    return parseInt(bindings[0].HostPort, 10);
  }
  throw new Error(`No port mapping found for ${containerNameForError} (${containerPortKey})`);
}

function getAllMappedPortsFromInspect(inspectInfo) {
  const ports = inspectInfo?.NetworkSettings?.Ports || {};
  const mapped = {};

  for (const [key, bindings] of Object.entries(ports)) {
    if (bindings && bindings.length > 0 && bindings[0]?.HostPort) {
      mapped[key] = parseInt(bindings[0].HostPort, 10);
    }
  }

  return mapped;
}

module.exports = {
  getMappedPort,
  getMappedPortFromInspect,
  getAllMappedPortsFromInspect,
};


