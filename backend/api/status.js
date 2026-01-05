const { findWindowsContainer, listWindowsContainers } = require('../utils/docker');
const { getVmRuntimeStatus } = require('../utils/vm-status');
const { getResourceInfo } = require('../utils/limits');

/**
 * Get current VM container status
 */
async function getStatus(req, res) {
  try {
    const resources = await getResourceInfo();

    // API consumers can request a specific VM.
    const requestedName = req.query.containerName;
    if (requestedName) {
      const vmStatus = await getVmRuntimeStatus(requestedName);
      return res.json({ ...vmStatus, resources });
    }

    // Legacy behavior: select a single VM (most recently started) for the current UI.
    const selected = await findWindowsContainer();

    const all = await listWindowsContainers({ all: true });
    const runningVms = all
      .filter(c => c.State === 'running')
      .sort((a, b) => (b.Created || 0) - (a.Created || 0))
      .map(c => ({
        containerName: c.Names?.[0]?.replace('/', ''),
        created: c.Created,
        status: c.Status,
      }));

    if (!selected) {
      return res.json({
        exists: false,
        running: false,
        qgaReady: false,
        desktopReady: false,
        containerName: null,
        resources,
        runningVms,
      });
    }

    const selectedName = selected.Names[0].replace('/', '');
    const selectedStatus = await getVmRuntimeStatus(selectedName);

    return res.json({
      ...selectedStatus,
      resources,
      runningVms,
    });
  } catch (e) {
    console.error('Error checking status:', e.message);
    res.json({
      exists: false,
      running: false,
      qgaReady: false,
      desktopReady: false,
      containerName: null
    });
  }
}

/**
 * Get status for a specific VM container
 */
async function getVmStatus(req, res) {
  const { containerName } = req.params;
  const resources = await getResourceInfo();
  const vmStatus = await getVmRuntimeStatus(containerName);
  res.json({ ...vmStatus, resources });
}

/**
 * Get Windows image build status
 */
function getBuildStatus(buildState) {
  return (req, res) => {
    res.json(buildState);
  };
}

module.exports = {
  getStatus,
  getVmStatus,
  getBuildStatus
};

