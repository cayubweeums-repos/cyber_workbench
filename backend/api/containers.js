const NodeService = require('../services/NodeService');

/**
 * List all container nodes
 */
async function listContainers(req, res) {
  try {
    const { docker } = require('../utils/docker');
    const containers = await docker.listContainers({ all: true });
    
    // Filter to only container nodes (not VMs)
    const containerNodes = containers
      .filter(c => {
        const labels = c.Labels || {};
        return labels['cyber-workbench.nodeType'] === 'container' || 
               labels['cyber-workbench.nodeType'] === 'service';
      })
      .map(c => ({
        id: c.Id,
        name: c.Names[0]?.replace('/', '') || c.Id,
        image: c.Image,
        status: c.Status,
        state: c.State,
        labels: c.Labels || {}
      }));
    
    res.json({ success: true, containers: containerNodes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Create a container node
 */
async function createContainer(req, res) {
  try {
    const nodeConfig = req.body;
    const node = await NodeService.createContainerNode(nodeConfig);
    res.json({ success: true, node });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Start a container
 */
async function startContainer(req, res) {
  try {
    const { containerName } = req.params;
    const result = await NodeService.startNode(containerName);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Stop a container
 */
async function stopContainer(req, res) {
  try {
    const { containerName } = req.params;
    const result = await NodeService.stopNode(containerName);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Delete a container
 */
async function deleteContainer(req, res) {
  try {
    const { containerName } = req.params;
    const result = await NodeService.deleteNode(containerName);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Get container status
 */
async function getContainerStatus(req, res) {
  try {
    const { containerName } = req.params;
    const status = await NodeService.getNodeStatus(containerName);
    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  listContainers,
  createContainer,
  startContainer,
  stopContainer,
  deleteContainer,
  getContainerStatus
};

