const { docker } = require('./docker');

const DEFAULT_VM_NETWORK_PREFIX = 'vmnet_';
const LEGACY_SANDBOX_PREFIX = 'sandbox-';

function getDefaultVmNetworkName(vmId) {
  return `${DEFAULT_VM_NETWORK_PREFIX}${vmId}`;
}

async function ensureDefaultVmNetwork(vmId, { internetEgress = true } = {}) {
  const networkName = getDefaultVmNetworkName(vmId);

  const networks = await docker.listNetworks();
  const existing = networks.find((n) => n.Name === networkName);

  if (existing) {
    const info = await docker.getNetwork(existing.Id).inspect();
    const labels = info?.Labels || {};
    const isOurs = labels['vapiorc.managed'] === 'true' && labels['vapiorc.purpose'] === 'vm-default';
    const ownerOk = !labels['vapiorc.vm'] || labels['vapiorc.vm'] === vmId;

    if (!isOurs || !ownerOk) {
      const err = new Error(`Network name is reserved but not owned by this VM: ${networkName}`);
      err.statusCode = 409;
      throw err;
    }

    return docker.getNetwork(existing.Id);
  }

  console.log(`[Network] Creating default per-VM network: ${networkName} (internetEgress: ${internetEgress})`);

  const network = await docker.createNetwork({
    Name: networkName,
    Driver: 'bridge',
    Internal: internetEgress ? false : true,
    EnableIPv6: false,
    Options: {
      // Default per-VM networks should be isolated, but still allow NAT egress unless Internal=true.
      'com.docker.network.bridge.enable_icc': 'false',
      'com.docker.network.bridge.host_binding_ipv4': '0.0.0.0',
    },
    Labels: {
      'vapiorc.managed': 'true',
      'vapiorc.purpose': 'vm-default',
      'vapiorc.auto': 'true',
      'vapiorc.vm': vmId,
      'vapiorc.internetEgress': internetEgress.toString(),
    },
  });

  return docker.getNetwork(network.id);
}

async function removeDefaultVmNetwork(vmId) {
  const networkName = getDefaultVmNetworkName(vmId);

  try {
    const networks = await docker.listNetworks();
    const existing = networks.find((n) => n.Name === networkName);
    if (!existing) return;

    const network = docker.getNetwork(existing.Id);
    const info = await network.inspect();

    const labels = info?.Labels || {};
    const isAutoVmDefault =
      labels['vapiorc.managed'] === 'true' &&
      labels['vapiorc.purpose'] === 'vm-default' &&
      labels['vapiorc.auto'] === 'true' &&
      labels['vapiorc.vm'] === vmId;

    if (!isAutoVmDefault) {
      // Never delete user networks automatically.
      return;
    }

    const containers = info?.Containers || {};
    const count = Object.keys(containers).length;
    if (count > 0) {
      // In use: do not delete.
      return;
    }

    await network.remove();
    console.log(`[Network] Removed default per-VM network: ${networkName}`);
  } catch (e) {
    console.warn(`[Network] Could not remove default per-VM network ${networkName}: ${e.message}`);
  }
}

async function removeLegacySandboxNetwork(vmId) {
  const networkName = `${LEGACY_SANDBOX_PREFIX}${vmId}`;

  try {
    const networks = await docker.listNetworks();
    const existing = networks.find((n) => n.Name === networkName);
    if (!existing) return;

    await docker.getNetwork(existing.Id).remove();
    console.log(`[Network] Removed legacy sandbox network: ${networkName}`);
  } catch (e) {
    console.warn(`[Network] Could not remove legacy sandbox network ${networkName}: ${e.message}`);
  }
}

module.exports = {
  getDefaultVmNetworkName,
  ensureDefaultVmNetwork,
  removeDefaultVmNetwork,
  removeLegacySandboxNetwork,
};
