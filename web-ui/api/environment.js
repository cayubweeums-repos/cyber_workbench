/**
 * Environment Management API endpoints
 */

const path = require('path');
const EnvironmentManager = require('./environment-manager');
const { callPythonInstanceMethod, REPO_ROOT } = require('./python-bridge');
const operations = require('./operations');
const { setProgress, getProgress, clearProgress } = require('./progress');
const { getSudoPassword } = require('./sudo-password');
const crypto = require('crypto');
const { NetworkingSelector } = require('./networking');

const environmentManager = new EnvironmentManager(REPO_ROOT);

/**
 * Generate a safe TAP interface name for Linux (<= 15 chars).
 * On macOS we don't control the tap name (tap0/tap1/...), so this is mainly for Linux.
 */
function makeTapName(vmName) {
  const safe = String(vmName || '').replace(/[^a-zA-Z0-9]/g, '');
  const prefix = `tap${safe.slice(0, 4)}`;
  const hash = crypto.createHash('sha1').update(String(vmName || '')).digest('hex').slice(0, 10);
  // e.g. tapwin1a1b2c3d4e (<= 15)
  return `${prefix}${hash}`.slice(0, 15);
}

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
    const warnings = [];
    const selector = new NetworkingSelector();
    // Track runtime resources for best-effort cleanup if start fails mid-way
    const createdNetworks = [];
    const createdTaps = [];
    const startedVMs = [];
    let updatedServices = [];

    const setEnvProgress = (progress) => {
      setProgress(name, { ...progress, warnings: [...warnings] });
    };

    const addWarning = (warning) => {
      const msg = String(warning || '').trim();
      if (!msg) return;
      warnings.push(msg);
      const current = getProgress(name) || {};
      setProgress(name, { ...current, warnings: [...warnings] });
    };
    
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
    setEnvProgress({
      stage: 'Starting Environment',
      message: 'Initializing environment...',
      percent: 0
    });
    
    try {
      // Step 1: Create networks
      setEnvProgress({
        stage: 'Creating Networks',
        message: 'Setting up network infrastructure...',
        percent: 10
      });
      
      const networkConfigs = {};
      const sudoPassword = getSudoPassword();
      
      for (const network of config.networks) {
        const isolated = network.isolated || false;

        try {
          // Create bridge network - pass sudo password during initialization
          await callPythonInstanceMethod(
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

          createdNetworks.push(network.name);

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
        } catch (e) {
          addWarning(
            `Failed to create environment network "${network.name}". ` +
            `Services will fall back to user-mode networking. Error: ${e.message || e}`
          );
        }
      }
      
      setEnvProgress({
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
      updatedServices = Array.isArray(config.services) ? [...config.services] : [];
      
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
          setEnvProgress({
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
            setEnvProgress({
              stage: `Creating Disk: ${service.name}`,
              message: `Creating disk for ${service.name}...`,
              percent: Math.floor(serviceProgress + 5)
            });
            await operations.createVMDisk(service.name, service.disk_size_gb, envVmsDir);
            
            // Download ISO
            setEnvProgress({
              stage: `Downloading ISO: ${service.name}`,
              message: `Downloading Windows ISO for ${service.name}...`,
              percent: Math.floor(serviceProgress + 10)
            });
            await operations.downloadWindowsISO(service.name, envVmsDir);
            
            // Prepare ISO
            setEnvProgress({
              stage: `Preparing ISO: ${service.name}`,
              message: `Preparing ISO for ${service.name}...`,
              percent: Math.floor(serviceProgress + 15)
            });
            // prepareISOForVM(vmName, providedSudoPassword = null, vmsDir = null)
            await operations.prepareISOForVM(service.name, sudoPassword || null, envVmsDir);
          }
          
          // Get network config for this service
          let networkConfig = null;
          let effectiveNetworkMode = 'user';
          if (service.network) {
            const tapName = makeTapName(service.name);
            const selection = await selector.selectServiceNetworking({
              serviceName: service.name,
              requestedNetworkName: service.network,
              networkConfigs,
              createTap: async () => {
                const netConfig = networkConfigs[service.network];
                const tapResult = await callPythonInstanceMethod(
                  'network_manager',
                  'NetworkManager',
                  { repo_root: REPO_ROOT, sudo_password: sudoPassword || null },
                  'create_tap_interface',
                  {
                    tap_name: tapName,
                    bridge_name: netConfig.bridge_name
                  }
                );
                // NetworkManager returns actual tap name on macOS; on Linux it may return requested name.
                return (typeof tapResult === 'string' && tapResult) ? tapResult : tapName;
              },
              warnings
            });
            networkConfig = selection.networkConfig;
            effectiveNetworkMode = selection.effectiveMode === 'tap' ? 'tap' : 'user';

            if (networkConfig && networkConfig.tap_name) {
              createdTaps.push({ tap_name: networkConfig.tap_name, bridge_name: networkConfig.bridge_name });
            }
          }
          
          // Start VM - get config first, then start
          setEnvProgress({
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
            startedVMs.push(service.name);
          }

          // Persist runtime network selection + tap name (if any) so stop() can clean up.
          try {
            const idx = updatedServices.findIndex(s => s && s.name === service.name);
            if (idx >= 0) {
              updatedServices[idx] = {
                ...updatedServices[idx],
                runtime: {
                  ...(updatedServices[idx].runtime || {}),
                  effective_network_mode: effectiveNetworkMode,
                  ...(networkConfig ? { bridge_name: networkConfig.bridge_name, tap_name: networkConfig.tap_name } : {})
                }
              };
            }
          } catch (e) {
            // best-effort only
          }
          
          serviceIndex++;
          
          // TODO: Apply tools if any (future implementation)
        }
      }
      
      // Update environment status to running
      setEnvProgress({
        stage: 'Ready',
        message: 'Environment started successfully',
        percent: 100
      });
      
      await environmentManager.updateEnvironment(name, {
        ...config,
        services: updatedServices,
        status: 'running',
        lastStartWarnings: warnings,
        lastStartedAt: new Date().toISOString()
      });
      
      // Clear progress after a delay
      setTimeout(() => {
        clearProgress(name);
      }, 5000);
      
      res.json({ success: true, message: 'Environment started successfully', warnings });
    } catch (error) {
      // Best-effort cleanup on failure: stop started VMs, delete created TAPs, delete created networks.
      try {
        // Stop any VMs that were started before failure
        if (typeof startedVMs !== 'undefined' && Array.isArray(startedVMs)) {
          for (const vmName of startedVMs) {
            try { await operations.stopVM(vmName); } catch (e) { /* ignore */ }
          }
        }

        // Delete any TAPs that were created (bridge deletion does not necessarily remove TAPs)
        if (typeof createdTaps !== 'undefined' && Array.isArray(createdTaps)) {
          for (const tap of createdTaps) {
            try {
              await callPythonInstanceMethod(
                'network_manager',
                'NetworkManager',
                { repo_root: REPO_ROOT, sudo_password: getSudoPassword() || null },
                'delete_tap_interface',
                { tap_name: tap.tap_name, bridge_name: tap.bridge_name || null }
              );
            } catch (e) { /* ignore */ }
          }
        }

        // Delete bridges that were created
        if (typeof createdNetworks !== 'undefined' && Array.isArray(createdNetworks)) {
          for (const netName of createdNetworks) {
            try {
              await callPythonInstanceMethod(
                'network_manager',
                'NetworkManager',
                { repo_root: REPO_ROOT, sudo_password: getSudoPassword() || null },
                'delete_bridge_network',
                { network_name: netName }
              );
            } catch (e) { /* ignore */ }
          }
        }
      } catch (e) {
        // ignore cleanup errors
      }

      // Update status back to stopped on error
      await environmentManager.updateEnvironment(name, {
        ...config,
        status: 'stopped',
        lastStartWarnings: warnings
      });
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
    const sudoPassword = getSudoPassword();
    
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

      // Clean up TAP interfaces created during start (if recorded)
      try {
        for (const service of config.services) {
          const rt = service && service.runtime ? service.runtime : null;
          if (rt && rt.tap_name) {
            try {
              await callPythonInstanceMethod(
                'network_manager',
                'NetworkManager',
                { repo_root: REPO_ROOT, sudo_password: sudoPassword || null },
                'delete_tap_interface',
                { tap_name: rt.tap_name, bridge_name: rt.bridge_name || null }
              );
            } catch (e) {
              console.warn(`Failed to delete TAP ${rt.tap_name}:`, e.message || e);
            }
          }
        }
      } catch (e) {
        // ignore
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
            { repo_root: REPO_ROOT, sudo_password: sudoPassword || null },
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

