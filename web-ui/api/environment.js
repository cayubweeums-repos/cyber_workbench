/**
 * Environment Management API endpoints
 */

const path = require('path');
const EnvironmentManager = require('./environment-manager');
const { callPythonInstanceMethod, REPO_ROOT } = require('./python-bridge');
const operations = require('./operations');
const { setProgress, clearProgress } = require('./progress');
const { getSudoPassword } = require('./sudo-password');

const environmentManager = new EnvironmentManager(REPO_ROOT);

/**
 * List all environments
 */
async function listEnvironments(req, res) {
  try {
    const environments = await environmentManager.listEnvironments();
    res.json({ success: true, environments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Get environment configuration
 */
async function getEnvironment(req, res) {
  try {
    const { name } = req.params;
    const config = await environmentManager.getEnvironment(name);
    
    if (!config) {
      return res.status(404).json({ success: false, error: 'Environment not found' });
    }
    
    res.json({ 
      success: true, 
      environment: config
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Create new environment
 */
async function createEnvironment(req, res) {
  try {
    const { name, services, networks } = req.body;
    
    if (!name) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required field: name' 
      });
    }
    
    // Validate services and networks
    if (!Array.isArray(services)) {
      return res.status(400).json({ 
        success: false, 
        error: 'services must be an array' 
      });
    }
    
    if (!Array.isArray(networks)) {
      return res.status(400).json({ 
        success: false, 
        error: 'networks must be an array' 
      });
    }
    
    const config = {
      name,
      services: services || [],
      networks: networks || [],
      status: 'stopped',
      createdAt: new Date().toISOString()
    };
    
    // Create environment config
    const created = await environmentManager.createEnvironment(config);
    
    if (!created) {
      return res.status(400).json({ 
        success: false, 
        error: 'Failed to create environment. It may already exist.' 
      });
    }
    
    res.json({ success: true, message: 'Environment configuration created' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Update environment configuration
 */
async function updateEnvironment(req, res) {
  try {
    const { name } = req.params;
    const { services, networks } = req.body;
    
    // Get existing config
    const existing = await environmentManager.getEnvironment(name);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Environment not found' });
    }
    
    // Update config
    const updated = {
      ...existing,
      services: services !== undefined ? services : existing.services,
      networks: networks !== undefined ? networks : existing.networks
    };
    
    const result = await environmentManager.updateEnvironment(name, updated);
    
    if (!result) {
      return res.status(400).json({ success: false, error: 'Failed to update environment' });
    }
    
    res.json({ success: true, message: 'Environment updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Delete environment
 */
async function deleteEnvironment(req, res) {
  try {
    const { name } = req.params;
    
    // Get environment config to check if running
    const config = await environmentManager.getEnvironment(name);
    if (config && config.status === 'running') {
      // Stop environment first (but don't send response yet)
      try {
        // Stop all VMs
        for (const service of config.services) {
          if (service.type === 'WindowsVM') {
            try {
              await operations.stopVM(service.name);
            } catch (error) {
              console.warn(`Failed to stop VM ${service.name}:`, error.message);
            }
          }
        }
        // Update status
        await environmentManager.updateEnvironment(name, { ...config, status: 'stopped' });
      } catch (error) {
        console.warn('Failed to stop environment before delete:', error.message);
      }
    }
    
    const result = await environmentManager.deleteEnvironment(name);
    
    if (!result) {
      return res.status(400).json({ success: false, error: 'Failed to delete environment' });
    }
    
    res.json({ success: true, message: 'Environment deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Start environment workflow
 */
async function startEnvironment(req, res) {
  try {
    const { name } = req.params;
    
    // Load environment config
    const config = await environmentManager.getEnvironment(name);
    if (!config) {
      return res.status(404).json({ success: false, error: 'Environment not found' });
    }
    
    // Check if already running
    if (config.status === 'running') {
      return res.json({ success: true, message: 'Environment is already running' });
    }
    
    // Update status to starting
    await environmentManager.updateEnvironment(name, { ...config, status: 'starting' });
    
    // Set initial progress
    setProgress(name, {
      stage: 'Starting Environment',
      message: 'Initializing environment...',
      percent: 0
    });
    
    try {
      // Step 1: Create networks
      setProgress(name, {
        stage: 'Creating Networks',
        message: 'Setting up network infrastructure...',
        percent: 10
      });
      
      const networkConfigs = {};
      const sudoPassword = getSudoPassword();
      
      for (const network of config.networks) {
        const isolated = network.isolated || false;
        
        // Create bridge network - pass sudo password during initialization
        const networkResult = await callPythonInstanceMethod(
          'network_manager',
          'NetworkManager',
          { 
            repo_root: REPO_ROOT,
            sudo_password: sudoPassword || null
          },
          'create_bridge_network',
          {
            network_name: network.name,
            subnet: network.subnet || null,
            isolated: isolated
          }
        );
        
        if (networkResult && networkResult.success !== false) {
          // Get network config to get bridge name
          const netConfig = await callPythonInstanceMethod(
            'network_manager',
            'NetworkManager',
            { repo_root: REPO_ROOT },
            'get_network_config',
            { network_name: network.name }
          );
          
          if (netConfig) {
            networkConfigs[network.name] = {
              bridge_name: netConfig.bridge_name,
              subnet: netConfig.subnet,
              isolated: netConfig.isolated
            };
          }
        }
      }
      
      setProgress(name, {
        stage: 'Creating Services',
        message: 'Creating and configuring services...',
        percent: 30
      });
      
      // Step 2: Create and start services
      // Create environment-specific VM directory
      const path = require('path');
      const fs = require('fs');
      const envVmsDir = path.join(REPO_ROOT, 'environments', name, 'vms');
      fs.mkdirSync(envVmsDir, { recursive: true });
      
      let serviceIndex = 0;
      const totalServices = config.services.length;
      
      // For each service of type WindowsVM
      for (const service of config.services) {
        if (service.type === 'WindowsVM') {
          // Check if VM exists in environment directory
          const vmList = await callPythonInstanceMethod(
            'vm_manager',
            'VMManager',
            { repo_root: REPO_ROOT, vms_dir: envVmsDir },
            'list_vms',
            { exclude_environments: false }
          );
          
          const vmExists = Array.isArray(vmList) && vmList.includes(service.name);
          
          // Update progress for this service
          const serviceProgress = 30 + (serviceIndex / totalServices) * 60;
          setProgress(name, {
            stage: `Creating Service: ${service.name}`,
            message: `Setting up ${service.name}...`,
            percent: Math.floor(serviceProgress)
          });
          
          if (!vmExists) {
            // Create VM config - use network from service if assigned
            const vmNetwork = service.network || 'user';
            await callPythonInstanceMethod(
              'vm_manager',
              'VMManager',
              { repo_root: REPO_ROOT, vms_dir: envVmsDir },
              'create_vm',
              {
                name: service.name,
                cpu_cores: service.cpu_cores,
                ram_gb: service.ram_gb,
                disk_size_gb: service.disk_size_gb,
                network: vmNetwork
              }
            );
            
            // Create disk
            setProgress(name, {
              stage: `Creating Disk: ${service.name}`,
              message: `Creating disk for ${service.name}...`,
              percent: Math.floor(serviceProgress + 5)
            });
            await operations.createVMDisk(service.name, service.disk_size_gb, envVmsDir);
            
            // Download ISO
            setProgress(name, {
              stage: `Downloading ISO: ${service.name}`,
              message: `Downloading Windows ISO for ${service.name}...`,
              percent: Math.floor(serviceProgress + 10)
            });
            await operations.downloadWindowsISO(service.name, envVmsDir);
            
            // Prepare ISO
            setProgress(name, {
              stage: `Preparing ISO: ${service.name}`,
              message: `Preparing ISO for ${service.name}...`,
              percent: Math.floor(serviceProgress + 15)
            });
            await operations.prepareISOForVM(service.name, envVmsDir);
          }
          
          // Get network config for this service
          let networkConfig = null;
          if (service.network && networkConfigs[service.network]) {
            const netConfig = networkConfigs[service.network];
            // Create TAP interface name
            const tapName = `tap-${service.name}`;
            
            // Create TAP interface and attach to bridge
            await callPythonInstanceMethod(
              'network_manager',
              'NetworkManager',
              { repo_root: REPO_ROOT },
              'create_tap_interface',
              {
                tap_name: tapName,
                bridge_name: netConfig.bridge_name
              }
            );
            
            networkConfig = {
              bridge_name: netConfig.bridge_name,
              tap_name: tapName,
              subnet: netConfig.subnet
            };
          }
          
          // Start VM - get config first, then start
          setProgress(name, {
            stage: `Starting VM: ${service.name}`,
            message: `Starting ${service.name}...`,
            percent: Math.floor(serviceProgress + 20)
          });
          
          const vmConfig = await callPythonInstanceMethod(
            'vm_manager',
            'VMManager',
            { repo_root: REPO_ROOT, vms_dir: envVmsDir },
            'get_vm_config',
            { vm_name: service.name }
          );
          
          if (vmConfig) {
            await operations.startVM(service.name, {
              name: vmConfig.name,
              cpu_cores: vmConfig.cpu_cores,
              ram_gb: vmConfig.ram_gb,
              disk_size_gb: vmConfig.disk_size_gb,
              network: vmConfig.network || 'user',
              created: vmConfig.created
            }, networkConfig, envVmsDir);
          }
          
          serviceIndex++;
          
          // TODO: Apply tools if any (future implementation)
        }
      }
      
      // Update environment status to running
      setProgress(name, {
        stage: 'Ready',
        message: 'Environment started successfully',
        percent: 100
      });
      
      await environmentManager.updateEnvironment(name, { ...config, status: 'running' });
      
      // Clear progress after a delay
      setTimeout(() => {
        clearProgress(name);
      }, 5000);
      
      res.json({ success: true, message: 'Environment started successfully' });
    } catch (error) {
      // Update status back to stopped on error
      await environmentManager.updateEnvironment(name, { ...config, status: 'stopped' });
      throw error;
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Stop environment
 */
async function stopEnvironment(req, res) {
  try {
    const { name } = req.params;
    
    // Load environment config
    const config = await environmentManager.getEnvironment(name);
    if (!config) {
      return res.status(404).json({ success: false, error: 'Environment not found' });
    }
    
    // Check if already stopped
    if (config.status === 'stopped') {
      return res.json({ success: true, message: 'Environment is already stopped' });
    }
    
    // Update status to stopping
    await environmentManager.updateEnvironment(name, { ...config, status: 'stopping' });
    
    try {
      setProgress(name, {
        stage: 'Stopping Environment',
        message: 'Stopping services...',
        percent: 0
      });
      
      // Environment VMs are in environments/{name}/vms/
      const path = require('path');
      const envVmsDir = path.join(REPO_ROOT, 'environments', name, 'vms');
      
      // Stop all VMs
      let serviceIndex = 0;
      const totalServices = config.services.length;
      for (const service of config.services) {
        if (service.type === 'WindowsVM') {
          try {
            setProgress(name, {
              stage: `Stopping Service: ${service.name}`,
              message: `Stopping ${service.name}...`,
              percent: Math.floor((serviceIndex / totalServices) * 80)
            });
            // Stop VM - operations.stopVM should work regardless of directory
            // since it uses VM name to find the process
            await operations.stopVM(service.name);
          } catch (error) {
            // Log but continue - VM might not exist or already stopped
            console.warn(`Failed to stop VM ${service.name}:`, error.message);
          }
        }
        serviceIndex++;
      }
      
      // Clean up networks
      setProgress(name, {
        stage: 'Cleaning Up Networks',
        message: 'Removing network infrastructure...',
        percent: 85
      });
      
      for (const network of config.networks) {
        try {
          await callPythonInstanceMethod(
            'network_manager',
            'NetworkManager',
            { repo_root: REPO_ROOT },
            'delete_bridge_network',
            { network_name: network.name }
          );
        } catch (error) {
          console.warn(`Failed to delete network ${network.name}:`, error.message);
        }
      }
      
      // Update environment status to stopped
      setProgress(name, {
        stage: 'Stopped',
        message: 'Environment stopped successfully',
        percent: 100
      });
      
      await environmentManager.updateEnvironment(name, { ...config, status: 'stopped' });
      
      // Clear progress after a delay
      setTimeout(() => {
        clearProgress(name);
      }, 3000);
      
      res.json({ success: true, message: 'Environment stopped successfully' });
    } catch (error) {
      // Update status back to running on error
      await environmentManager.updateEnvironment(name, { ...config, status: 'running' });
      throw error;
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  listEnvironments,
  getEnvironment,
  createEnvironment,
  updateEnvironment,
  deleteEnvironment,
  startEnvironment,
  stopEnvironment
};

