const fs = require('fs');
const path = require('path');
const { docker } = require('../utils/docker');
const NodeService = require('./NodeService');
const NetworkService = require('./NetworkService');

const ENVIRONMENTS_DIR = process.env.ENVIRONMENTS_DIR || '/app/storage/environments';

// Ensure environments directory exists
if (!fs.existsSync(ENVIRONMENTS_DIR)) {
  fs.mkdirSync(ENVIRONMENTS_DIR, { recursive: true });
}

/**
 * EnvironmentService - Manages multi-node environments
 */
class EnvironmentService {
  /**
   * Create a new environment
   */
  async createEnvironment(envData, buildState) {
    const {
      id,
      name,
      nodes = [],
      networks = []
    } = envData;
    
    // Create networks first
    const createdNetworks = [];
    for (const networkConfig of networks) {
      const network = await NetworkService.createNetwork(networkConfig);
      createdNetworks.push(network);
    }
    
    // Create nodes
    const createdNodes = [];
    for (const nodeConfig of nodes) {
      let node;
      if (nodeConfig.type === 'vm') {
        node = await NodeService.createVMNode(nodeConfig, buildState);
      } else if (nodeConfig.type === 'container' || nodeConfig.type === 'service') {
        node = await NodeService.createContainerNode(nodeConfig);
      } else {
        throw new Error(`Unknown node type: ${nodeConfig.type}`);
      }
      createdNodes.push(node);
      
      // Attach to specified networks
      if (nodeConfig.networks && nodeConfig.networks.length > 0) {
        for (const networkName of nodeConfig.networks) {
          await NodeService.attachToNetwork(node.containerName, networkName);
        }
      }
    }
    
    // Save environment definition
    const environment = {
      id,
      name,
      nodes: createdNodes,
      networks: createdNetworks,
      status: 'stopped',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await this.saveEnvironment(environment);
    
    return environment;
  }
  
  /**
   * Start an environment
   */
  async startEnvironment(envId) {
    const environment = await this.loadEnvironment(envId);
    if (!environment) {
      throw new Error(`Environment ${envId} not found`);
    }
    
    environment.status = 'starting';
    await this.saveEnvironment(environment);
    
    // Start all nodes
    const startPromises = environment.nodes.map(node => 
      NodeService.startNode(node.containerName).catch(err => {
        console.error(`Failed to start node ${node.containerName}:`, err);
        return { success: false, containerName: node.containerName, error: err.message };
      })
    );
    
    const results = await Promise.all(startPromises);
    const failed = results.filter(r => !r.success);
    
    if (failed.length > 0) {
      environment.status = 'partial';
      await this.saveEnvironment(environment);
      throw new Error(`Failed to start some nodes: ${failed.map(f => f.containerName).join(', ')}`);
    }
    
    environment.status = 'running';
    environment.updatedAt = new Date().toISOString();
    await this.saveEnvironment(environment);
    
    return environment;
  }
  
  /**
   * Stop an environment
   */
  async stopEnvironment(envId) {
    const environment = await this.loadEnvironment(envId);
    if (!environment) {
      throw new Error(`Environment ${envId} not found`);
    }
    
    environment.status = 'stopping';
    await this.saveEnvironment(environment);
    
    // Stop all nodes
    const stopPromises = environment.nodes.map(node => 
      NodeService.stopNode(node.containerName).catch(err => {
        console.error(`Failed to stop node ${node.containerName}:`, err);
        return { success: false, containerName: node.containerName, error: err.message };
      })
    );
    
    await Promise.all(stopPromises);
    
    environment.status = 'stopped';
    environment.updatedAt = new Date().toISOString();
    await this.saveEnvironment(environment);
    
    return environment;
  }
  
  /**
   * Delete an environment
   */
  async deleteEnvironment(envId) {
    const environment = await this.loadEnvironment(envId);
    if (!environment) {
      throw new Error(`Environment ${envId} not found`);
    }
    
    // Stop environment first if running
    if (environment.status === 'running') {
      await this.stopEnvironment(envId);
    }
    
    // Delete all nodes
    const deletePromises = environment.nodes.map(node => 
      NodeService.deleteNode(node.containerName).catch(err => {
        console.error(`Failed to delete node ${node.containerName}:`, err);
        return { success: false, containerName: node.containerName, error: err.message };
      })
    );
    
    await Promise.all(deletePromises);
    
    // Delete environment file
    const envFile = path.join(ENVIRONMENTS_DIR, `${envId}.json`);
    if (fs.existsSync(envFile)) {
      fs.unlinkSync(envFile);
    }
    
    return { success: true, envId };
  }
  
  /**
   * Get environment status
   */
  async getEnvironmentStatus(envId) {
    const environment = await this.loadEnvironment(envId);
    if (!environment) {
      return null;
    }
    
    // Check actual node statuses
    const nodeStatuses = await Promise.all(
      environment.nodes.map(node => NodeService.getNodeStatus(node.containerName))
    );
    
    const runningCount = nodeStatuses.filter(s => s.running).length;
    const totalCount = nodeStatuses.length;
    
    // Update status based on actual node states
    if (runningCount === 0) {
      environment.status = 'stopped';
    } else if (runningCount === totalCount) {
      environment.status = 'running';
    } else {
      environment.status = 'partial';
    }
    
    environment.nodeStatuses = nodeStatuses;
    environment.updatedAt = new Date().toISOString();
    
    return environment;
  }
  
  /**
   * List all environments
   */
  async listEnvironments() {
    if (!fs.existsSync(ENVIRONMENTS_DIR)) {
      return [];
    }
    
    const files = fs.readdirSync(ENVIRONMENTS_DIR);
    const environments = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const envId = file.replace('.json', '');
        try {
          const env = await this.loadEnvironment(envId);
          if (env) {
            // Get current status
            const status = await this.getEnvironmentStatus(envId);
            environments.push(status || env);
          }
        } catch (err) {
          console.error(`Error loading environment ${envId}:`, err);
        }
      }
    }
    
    return environments;
  }
  
  /**
   * Load environment from file
   */
  async loadEnvironment(envId) {
    const envFile = path.join(ENVIRONMENTS_DIR, `${envId}.json`);
    if (!fs.existsSync(envFile)) {
      return null;
    }
    
    const content = fs.readFileSync(envFile, 'utf8');
    return JSON.parse(content);
  }
  
  /**
   * Save environment to file
   */
  async saveEnvironment(environment) {
    const envFile = path.join(ENVIRONMENTS_DIR, `${environment.id}.json`);
    fs.writeFileSync(envFile, JSON.stringify(environment, null, 2));
  }
}

module.exports = new EnvironmentService();

