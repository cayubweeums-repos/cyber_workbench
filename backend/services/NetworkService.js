const { docker } = require('../utils/docker');

/**
 * NetworkService - Manages Docker networks
 */
class NetworkService {
  /**
   * Create a network
   */
  async createNetwork(networkConfig) {
    const {
      name,
      driver = 'bridge',
      internal = false,
      attachable = true,
      enableIPv6 = false
    } = networkConfig;
    
    // Check if network already exists
    const networks = await docker.listNetworks();
    const existing = networks.find(n => n.Name === name);
    
    if (existing) {
      const network = docker.getNetwork(existing.Id);
      const info = await network.inspect();
      return {
        id: info.Id,
        name: info.Name,
        driver: info.Driver,
        internal: info.Internal || false,
        attachable: info.Attachable || false
      };
    }
    
    // Create network
    const network = await docker.createNetwork({
      Name: name,
      Driver: driver,
      Internal: internal,
      EnableIPv6: enableIPv6,
      Attachable: attachable,
      Labels: {
        'cyber-workbench.managed': 'true'
      }
    });
    
    const info = await network.inspect();
    
    return {
      id: info.Id,
      name: info.Name,
      driver: info.Driver,
      internal: info.Internal || false,
      attachable: info.Attachable || false
    };
  }
  
  /**
   * List all networks
   */
  async listNetworks() {
    const networks = await docker.listNetworks();
    return networks.map(n => ({
      id: n.Id,
      name: n.Name,
      driver: n.Driver,
      scope: n.Scope,
      internal: n.Internal || false,
      attachable: n.Attachable || false
    }));
  }
  
  /**
   * Get network by name or ID
   */
  async getNetwork(nameOrId) {
    const network = docker.getNetwork(nameOrId);
    const info = await network.inspect();
    return {
      id: info.Id,
      name: info.Name,
      driver: info.Driver,
      internal: info.Internal || false,
      attachable: info.Attachable || false,
      containers: Object.keys(info.Containers || {})
    };
  }
  
  /**
   * Delete a network
   */
  async deleteNetwork(nameOrId) {
    const network = docker.getNetwork(nameOrId);
    await network.remove();
    return { success: true, nameOrId };
  }
}

module.exports = new NetworkService();

