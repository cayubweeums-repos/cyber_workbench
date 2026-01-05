const { getContainer } = require('../utils/docker');
const {
  connectContainerToNetwork,
  disconnectContainerFromNetwork,
  inspectNetwork,
} = require('../utils/docker-networks');

function asArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function getNetworkRef(spec) {
  if (!spec) return null;
  return spec.idOrName || spec.name || spec.id || null;
}

function networkMatchesRef(netName, netId, ref) {
  if (!ref) return false;
  return ref === netName || ref === netId;
}

async function updateVmNetworks(req, res) {
  const { containerName } = req.params;
  const { connectNetworks, disconnectNetworks } = req.body || {};

  try {
    const container = getContainer(containerName);
    const info = await container.inspect();

    const currentNetworks = info?.NetworkSettings?.Networks || {};
    const currentNames = Object.keys(currentNetworks);
    const currentIds = Object.values(currentNetworks).map((n) => n?.NetworkID).filter(Boolean);
    const primaryNetworkName = info?.HostConfig?.NetworkMode || null;

    const connectSpecs = asArray(connectNetworks).filter(Boolean);
    const disconnectSpecs = asArray(disconnectNetworks).filter(Boolean);

    // Determine how many networks we'd have after the operation (rough safety).
    const disconnectTargets = disconnectSpecs
      .map((s) => getNetworkRef(s))
      .filter(Boolean);

    let disconnectConnectedCount = 0;
    for (const ref of disconnectTargets) {
      const isConnected =
        currentNames.some((n) => networkMatchesRef(n, currentNetworks[n]?.NetworkID, ref)) ||
        currentIds.includes(ref);
      if (isConnected) disconnectConnectedCount += 1;
    }

    let connectNewCount = 0;
    for (const s of connectSpecs) {
      const ref = getNetworkRef(s);
      if (!ref) continue;
      const isConnected =
        currentNames.some((n) => networkMatchesRef(n, currentNetworks[n]?.NetworkID, ref)) ||
        currentIds.includes(ref);
      if (!isConnected) connectNewCount += 1;
    }

    const resultingCount = currentNames.length - disconnectConnectedCount + connectNewCount;
    if (resultingCount < 1) {
      return res.status(400).json({
        success: false,
        error: 'Cannot disconnect VM from all networks (at least one network is required)',
      });
    }

    const results = { connected: [], disconnected: [] };

    for (const s of connectSpecs) {
      const ref = getNetworkRef(s);
      if (!ref) {
        return res.status(400).json({ success: false, error: 'connectNetworks entries require name (or idOrName)' });
      }

      // Validate network exists up-front for clearer errors.
      await inspectNetwork(ref);

      const r = await connectContainerToNetwork(containerName, ref, {
        aliases: s.aliases,
        ipv4Address: s.ipv4Address,
        ipv6Address: s.ipv6Address,
      });
      results.connected.push({ network: ref, ...r });
    }

    for (const s of disconnectSpecs) {
      const ref = getNetworkRef(s);
      if (!ref) {
        return res.status(400).json({ success: false, error: 'disconnectNetworks entries require name (or idOrName)' });
      }

      // Disallow disconnecting the primary network (NetworkMode).
      const primaryMatches =
        primaryNetworkName &&
        (ref === primaryNetworkName ||
          currentNames.some((n) => n === primaryNetworkName && networkMatchesRef(n, currentNetworks[n]?.NetworkID, ref)));

      if (primaryMatches) {
        return res.status(400).json({
          success: false,
          error: `Cannot disconnect primary network (${primaryNetworkName}). To change primary network, recreate the VM container.`,
        });
      }

      // Validate network exists (helps differentiate "not connected" from "not found").
      await inspectNetwork(ref);

      const r = await disconnectContainerFromNetwork(containerName, ref);
      results.disconnected.push({ network: ref, ...r });
    }

    const updated = await container.inspect();
    const updatedNetworks = Object.keys(updated?.NetworkSettings?.Networks || {});

    res.json({
      success: true,
      containerName,
      primaryNetwork: updated?.HostConfig?.NetworkMode || null,
      networks: updatedNetworks,
      results,
    });
  } catch (e) {
    const status = e.statusCode || 500;
    console.error('Error updating VM networks:', e.message);
    res.status(status).json({ success: false, error: e.message, ...(e.details && { details: e.details }) });
  }
}

module.exports = {
  updateVmNetworks,
};




