const { getVmRuntimeStatus } = require('../utils/vm-status');
const { getRequestOriginWithPort } = require('../utils/request-url');

const INTERNAL_WEB_PORT_KEY = '8006/tcp'; // nginx inside the Windows VM container

/**
 * API: Get viewer metadata for a VM (API-first contract).
 *
 * Viewers are discovered via Docker port mappings + request context (no hard-coded URLs).
 */
async function getViewers(req, res) {
  const { containerName } = req.params;

  const status = await getVmRuntimeStatus(containerName);
  if (!status.exists) {
    return res.status(404).json({ success: false, error: status.error || 'VM container not found' });
  }

  const webPort = status.ports?.[INTERNAL_WEB_PORT_KEY];
  if (!webPort) {
    return res.status(409).json({
      success: false,
      error: `VM is missing required published port (${INTERNAL_WEB_PORT_KEY})`,
    });
  }

  const viewerOrigin = getRequestOriginWithPort(req, webPort);

  const viewers = [
    {
      type: 'novnc',
      url: `${viewerOrigin}/`,
      ready: Boolean(status.running),
      notes: 'noVNC served by nginx inside the VM container',
    },
    {
      type: 'guacamole',
      url: `${viewerOrigin}/guac/`,
      ready: Boolean(status.running && status.desktopReady),
      notes: 'Guacamole (RDP) served by the VM container; ready once Windows desktop is ready',
    },
  ];

  return res.json({
    success: true,
    id: containerName,
    containerName,
    viewers,
    ports: {
      [INTERNAL_WEB_PORT_KEY]: webPort,
    },
    status: {
      running: status.running,
      qgaReady: status.qgaReady,
      desktopReady: status.desktopReady,
    },
  });
}

module.exports = {
  getViewers,
};


