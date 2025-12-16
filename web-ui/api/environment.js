/**
 * Environment Management API endpoints
 */

const path = require('path');
const EnvironmentManager = require('./environment-manager');
const { callPythonInstanceMethod, REPO_ROOT } = require('./python-bridge');
const operations = require('./operations');

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
    
    try {
      // For each service of type WindowsVM
      for (const service of config.services) {
        if (service.type === 'WindowsVM') {
          // Check if VM exists
          const vmList = await callPythonInstanceMethod(
            'vm_manager',
            'VMManager',
            { repo_root: REPO_ROOT },
            'list_vms'
          );
          
          const vmExists = Array.isArray(vmList) && vmList.includes(service.name);
          
          if (!vmExists) {
            // Create VM config
            await callPythonInstanceMethod(
              'vm_manager',
              'VMManager',
              { repo_root: REPO_ROOT },
              'create_vm',
              {
                name: service.name,
                cpu_cores: service.cpu_cores,
                ram_gb: service.ram_gb,
                disk_size_gb: service.disk_size_gb
              }
            );
            
            // Create disk, download ISO, prepare ISO
            await operations.createVMDisk(service.name, service.disk_size_gb);
            await operations.downloadWindowsISO(service.name);
            await operations.prepareISOForVM(service.name);
          }
          
          // Start VM - get config first, then start
          const vmConfig = await callPythonInstanceMethod(
            'vm_manager',
            'VMManager',
            { repo_root: REPO_ROOT },
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
            });
          }
          
          // TODO: Apply tools if any (future implementation)
        }
      }
      
      // Update environment status to running
      await environmentManager.updateEnvironment(name, { ...config, status: 'running' });
      
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
      // Stop all VMs
      for (const service of config.services) {
        if (service.type === 'WindowsVM') {
          try {
            await operations.stopVM(service.name);
          } catch (error) {
            // Log but continue - VM might not exist or already stopped
            console.warn(`Failed to stop VM ${service.name}:`, error.message);
          }
        }
      }
      
      // Update environment status to stopped
      await environmentManager.updateEnvironment(name, { ...config, status: 'stopped' });
      
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

