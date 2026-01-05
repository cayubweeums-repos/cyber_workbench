const { getContainer } = require('./docker');
const { getLifecycleMetadata } = require('./lifecycle');
const { getAllMappedPortsFromInspect } = require('./ports');
const { getQgaHealth, getDesktopReady } = require('./qga-readiness');

/**
 * Compute runtime status for a Windows VM container.
 *
 * - Uses QGA Flask API inside the VM container (localhost:8007) for readiness signals.
 * - Includes mapped host ports derived from Docker inspect.
 */
async function getVmRuntimeStatus(containerName) {
  try {
    const container = getContainer(containerName);
    const info = await container.inspect();

    const running = Boolean(info?.State?.Running);
    const mappedPorts = getAllMappedPortsFromInspect(info);

    let qgaReady = false;
    let desktopReady = false;
    let qgaError = null;
    let desktopError = null;

    if (running) {
      try {
        const qga = await getQgaHealth(container);
        qgaReady = qga.qgaReady;
        qgaError = qga.qgaError || (qga.stderr ? `curl stderr: ${qga.stderr}` : null);

        if (qgaReady) {
          const desktop = await getDesktopReady(container);
          desktopReady = desktop.desktopReady;
          desktopError = desktop.desktopError || (desktop.stderr ? `curl stderr: ${desktop.stderr}` : null);
        } else {
          desktopError = 'Skipped - QGA not ready';
        }
      } catch (e) {
        qgaReady = false;
        desktopReady = false;
        qgaError = `QGA health check failed: ${e.message}`;
        desktopError = 'Skipped - QGA health check failed';
      }
    }

    const lifecycle = await getLifecycleMetadata({
      Labels: info?.Config?.Labels || {},
      Name: `/${containerName}`,
    }, { desktopReady });

    return {
      exists: true,
      containerName,
      running,
      qgaReady,
      desktopReady,
      lifecycle,
      ports: mappedPorts,
      ...(qgaError && { qgaError }),
      ...(desktopError && { desktopError }),
    };
  } catch (e) {
    return {
      exists: false,
      containerName,
      running: false,
      qgaReady: false,
      desktopReady: false,
      error: e.message,
    };
  }
}

module.exports = {
  getVmRuntimeStatus,
};


