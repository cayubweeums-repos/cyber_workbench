const { docker, getContainer, createContainer } = require('../utils/docker');
const { ensureDefaultVmNetwork } = require('../utils/network');
const { createLifecycleLabels } = require('../utils/lifecycle');
const { getVmStoragePath, saveVmConfig } = require('../utils/config');
const { parseAndInjectScripts } = require('../utils/xml');
const path = require('path');

/**
 * NodeService - Unified node lifecycle management for VMs and containers
 */
class NodeService {
  /**
   * Create a VM node
   */
  async createVMNode(nodeConfig, buildState) {
    const {
      id,
      name,
      version = '11',
      ram = '8G',
      cpu = '4',
      username = 'user',
      password = 'password',
      persistent = false,
      timeLimit = null,
      networks = [],
      advancedScripts = null
    } = nodeConfig;

    const vmId = `win${version}_${id}`;
    const osType = `win${version}`;
    
    // Get storage path
    const storagePath = getVmStoragePath(osType, id);
    const hostStoragePath = process.env.STORAGE_BASE 
      ? path.join(process.env.STORAGE_BASE, `${osType}_${id}`)
      : storagePath;
    
    // Save VM config
    saveVmConfig(storagePath, { ram, cpu, username, password });
    
    // Process advanced scripts if provided
    if (advancedScripts && Object.keys(advancedScripts).some(key => advancedScripts[key]?.length > 0)) {
      await parseAndInjectScripts(version, hostStoragePath, advancedScripts);
    } else {
      await parseAndInjectScripts(version, hostStoragePath, null);
    }
    
    // Check if image is ready
    const imageName = 'dockurr/windows:custom';
    if (!buildState.isReady) {
      throw new Error('Windows image is not ready yet. Please wait for the build to complete.');
    }
    
    // Ensure default VM network
    const defaultNetwork = await ensureDefaultVmNetwork(vmId, {
      internetEgress: process.env.VM_ALLOW_INTERNET !== 'false'
    });
    
    // Create lifecycle labels
    const lifecycleLabels = createLifecycleLabels(timeLimit, persistent);
    
    // Prepare container config
    const containerConfig = {
      Image: imageName,
      name: vmId,
      Hostname: vmId,
      Env: [
        `VERSION=${version}`,
        `RAM_SIZE=${ram}`,
        `CPU_CORES=${cpu}`,
        `DISK_SIZE=64G`,
        `USERNAME=${username}`,
        `PASSWORD=${password}`,
        'QGA_ENABLE=Y',
        'QMP_ENABLE=Y',
        'GUACAMOLE_ENABLE=Y'
      ],
      Labels: {
        ...lifecycleLabels,
        'cyber-workbench.nodeId': id,
        'cyber-workbench.nodeName': name,
        'cyber-workbench.nodeType': 'vm',
        'cyber-workbench.version': version
      },
      HostConfig: {
        Devices: [
          { PathOnHost: '/dev/kvm', PathInContainer: '/dev/kvm', CgroupPermissions: 'rwm' },
          { PathOnHost: '/dev/net/tun', PathInContainer: '/dev/net/tun', CgroupPermissions: 'rwm' }
        ],
        CapAdd: ['NET_ADMIN'],
        Binds: [
          `${hostStoragePath}:/storage:z`,
          `${process.env.RECORDINGS_PATH || '/app/storage/recordings'}:/recordings:z`
        ],
        NetworkMode: defaultNetwork.name,
        RestartPolicy: { Name: 'unless-stopped' }
      }
    };
    
    // Create container
    const container = await createContainer(containerConfig);
    
    return {
      id,
      name,
      type: 'vm',
      containerName: vmId,
      containerId: container.id,
      status: 'created'
    };
  }
  
  /**
   * Create a container node
   */
  async createContainerNode(nodeConfig) {
    const {
      id,
      name,
      image,
      env = {},
      volumes = [],
      ports = [],
      networks = [],
      command = null,
      restart = 'unless-stopped'
    } = nodeConfig;
    
    const containerName = `container_${id}`;
    
    // Prepare environment variables
    const envArray = Object.entries(env).map(([key, value]) => `${key}=${value}`);
    
    // Prepare volume binds
    const binds = volumes.map(v => `${v.host}:${v.container}${v.readonly ? ':ro' : ''}`);
    
    // Prepare port bindings
    const portBindings = {};
    ports.forEach(p => {
      portBindings[`${p.container}/tcp`] = [{ HostPort: p.host.toString() }];
    });
    
    // Prepare container config
    const containerConfig = {
      Image: image,
      name: containerName,
      Env: envArray,
      Labels: {
        'cyber-workbench.nodeId': id,
        'cyber-workbench.nodeName': name,
        'cyber-workbench.nodeType': 'container'
      },
      HostConfig: {
        Binds: binds,
        PortBindings: portBindings,
        RestartPolicy: { Name: restart }
      }
    };
    
    // Add command if provided
    if (command) {
      containerConfig.Cmd = Array.isArray(command) ? command : command.split(' ');
    }
    
    // Create container
    const container = await createContainer(containerConfig);
    
    // Attach to networks if specified
    if (networks.length > 0) {
      for (const networkName of networks) {
        try {
          const network = docker.getNetwork(networkName);
          await network.connect({ Container: container.id });
        } catch (err) {
          console.warn(`Failed to attach container ${containerName} to network ${networkName}:`, err.message);
        }
      }
    }
    
    return {
      id,
      name,
      type: 'container',
      containerName,
      containerId: container.id,
      status: 'created'
    };
  }
  
  /**
   * Start a node
   */
  async startNode(containerName) {
    const container = getContainer(containerName);
    await container.start();
    return { success: true, containerName };
  }
  
  /**
   * Stop a node
   */
  async stopNode(containerName) {
    const container = getContainer(containerName);
    await container.stop();
    return { success: true, containerName };
  }
  
  /**
   * Delete a node
   */
  async deleteNode(containerName) {
    const container = getContainer(containerName);
    try {
      await container.stop();
    } catch (err) {
      // Container may already be stopped
    }
    await container.remove({ force: true });
    return { success: true, containerName };
  }
  
  /**
   * Get node status
   */
  async getNodeStatus(containerName) {
    try {
      const container = getContainer(containerName);
      const info = await container.inspect();
      return {
        containerName,
        status: info.State.Status,
        running: info.State.Running,
        startedAt: info.State.StartedAt
      };
    } catch (err) {
      return {
        containerName,
        status: 'not_found',
        running: false
      };
    }
  }
  
  /**
   * Attach node to network
   */
  async attachToNetwork(containerName, networkName) {
    const container = getContainer(containerName);
    const network = docker.getNetwork(networkName);
    await network.connect({ Container: container.id });
    return { success: true, containerName, networkName };
  }
  
  /**
   * Detach node from network
   */
  async detachFromNetwork(containerName, networkName) {
    const container = getContainer(containerName);
    const network = docker.getNetwork(networkName);
    await network.disconnect({ Container: container.id });
    return { success: true, containerName, networkName };
  }
}

module.exports = new NodeService();

