const crypto = require('crypto');
const { docker } = require('./docker');

const VAPIORC_LABEL_MANAGED = 'vapiorc.managed';
const VAPIORC_LABEL_PURPOSE = 'vapiorc.purpose';

function randomSuffix() {
  return crypto.randomBytes(4).toString('hex');
}

function isNotFound(err) {
  return err && (err.statusCode === 404 || /no such network/i.test(err.message || ''));
}

function buildEndpointConfig(spec = {}) {
  const endpoint = {};

  if (Array.isArray(spec.aliases) && spec.aliases.length > 0) {
    endpoint.Aliases = spec.aliases.filter(Boolean);
  }

  if (spec.ipv4Address || spec.ipv6Address) {
    endpoint.IPAMConfig = {};
    if (spec.ipv4Address) endpoint.IPAMConfig.IPv4Address = spec.ipv4Address;
    if (spec.ipv6Address) endpoint.IPAMConfig.IPv6Address = spec.ipv6Address;
  }

  return endpoint;
}

async function inspectNetwork(idOrName) {
  try {
    const network = docker.getNetwork(idOrName);
    const info = await network.inspect();
    return { network, info };
  } catch (e) {
    if (!isNotFound(e)) throw e;

    // Fallback: docker.getNetwork(name) should work, but on some engines it doesn't.
    const networks = await docker.listNetworks();
    const match = networks.find((n) => n.Name === idOrName || n.Id === idOrName);
    if (!match) {
      const err = new Error(`Network not found: ${idOrName}`);
      err.statusCode = 404;
      throw err;
    }
    const network = docker.getNetwork(match.Id);
    const info = await network.inspect();
    return { network, info };
  }
}

function normalizeManagedLabels(labels = {}) {
  return {
    ...labels,
    [VAPIORC_LABEL_MANAGED]: 'true',
  };
}

function summarizeNetworkInspect(info) {
  const ipam = info?.IPAM?.Config || [];
  const first = ipam[0] || {};
  const containers = info?.Containers || {};

  return {
    id: info?.Id,
    name: info?.Name,
    driver: info?.Driver,
    scope: info?.Scope,
    internal: Boolean(info?.Internal),
    attachable: Boolean(info?.Attachable),
    enableIPv6: Boolean(info?.EnableIPv6),
    labels: info?.Labels || {},
    options: info?.Options || {},
    ipam: {
      driver: info?.IPAM?.Driver || null,
      config: ipam,
      subnet: first.Subnet || null,
      gateway: first.Gateway || null,
    },
    containers: {
      count: Object.keys(containers).length,
      names: Object.values(containers)
        .map((c) => c?.Name)
        .filter(Boolean),
    },
    managed: (info?.Labels || {})[VAPIORC_LABEL_MANAGED] === 'true',
    purpose: (info?.Labels || {})[VAPIORC_LABEL_PURPOSE] || null,
  };
}

async function listNetworks({ all = false } = {}) {
  const networks = await docker.listNetworks();

  const candidates = all
    ? networks
    : networks.filter((n) => (n.Labels || {})[VAPIORC_LABEL_MANAGED] === 'true');

  const results = [];
  for (const n of candidates) {
    try {
      const { info } = await inspectNetwork(n.Id);
      results.push(summarizeNetworkInspect(info));
    } catch (e) {
      // Best-effort listing; a network may disappear between list and inspect.
      if (!isNotFound(e)) throw e;
    }
  }

  // Stable sort for UX
  results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return results;
}

async function createNetwork({
  name,
  driver = 'bridge',
  internal = false,
  attachable = undefined,
  enableIPv6 = false,
  ipam = undefined,
  labels = {},
  options = {},
} = {}) {
  const effectiveName = name && name.trim() ? name.trim() : `vapiorc-net-${randomSuffix()}`;

  // Avoid accidental collisions with existing networks.
  const existing = await docker.listNetworks();
  const nameTaken = existing.some((n) => n.Name === effectiveName);
  if (nameTaken) {
    const err = new Error(`Network name already exists: ${effectiveName}`);
    err.statusCode = 409;
    throw err;
  }

  const payload = {
    Name: effectiveName,
    Driver: driver,
    Internal: Boolean(internal),
    EnableIPv6: Boolean(enableIPv6),
    Labels: normalizeManagedLabels(labels),
    Options: options || {},
  };

  if (typeof attachable === 'boolean') payload.Attachable = attachable;
  if (ipam) payload.IPAM = ipam;

  const network = await docker.createNetwork(payload);
  const { info } = await inspectNetwork(network.id);
  return summarizeNetworkInspect(info);
}

async function deleteNetwork(idOrName) {
  const { network, info } = await inspectNetwork(idOrName);
  const containers = info?.Containers || {};
  const inUseCount = Object.keys(containers).length;

  if (inUseCount > 0) {
    const err = new Error(`Network is in use by ${inUseCount} container(s)`);
    err.statusCode = 409;
    err.details = {
      containers: Object.values(containers)
        .map((c) => ({ name: c?.Name, endpointId: c?.EndpointID }))
        .filter((c) => c.name),
    };
    throw err;
  }

  await network.remove();
  return { success: true };
}

async function connectContainerToNetwork(containerName, idOrName, spec = {}) {
  const { network, info } = await inspectNetwork(idOrName);
  const containers = info?.Containers || {};

  const alreadyConnected = Object.values(containers).some((c) => c?.Name === containerName);
  if (alreadyConnected) {
    return { connected: false, message: 'Already connected' };
  }

  await network.connect({
    Container: containerName,
    EndpointConfig: buildEndpointConfig(spec),
  });

  return { connected: true };
}

async function disconnectContainerFromNetwork(containerName, idOrName) {
  const { network, info } = await inspectNetwork(idOrName);
  const containers = info?.Containers || {};

  const isConnected = Object.values(containers).some((c) => c?.Name === containerName);
  if (!isConnected) {
    return { disconnected: false, message: 'Not connected' };
  }

  await network.disconnect({ Container: containerName, Force: true });
  return { disconnected: true };
}

module.exports = {
  VAPIORC_LABEL_MANAGED,
  VAPIORC_LABEL_PURPOSE,
  inspectNetwork,
  listNetworks,
  createNetwork,
  deleteNetwork,
  connectContainerToNetwork,
  disconnectContainerFromNetwork,
  summarizeNetworkInspect,
  normalizeManagedLabels,
};


