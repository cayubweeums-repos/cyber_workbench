/**
 * VM Management API endpoints
 */

const { callPythonInstanceMethod, isVMRunning, REPO_ROOT } = require('./python-bridge');
const operations = require('./operations');

/**
 * List all VMs
 */
async function listVMs(req, res) {
  try {
    const vms = await callPythonInstanceMethod(
      'vm_manager',
      'VMManager',
      { repo_root: REPO_ROOT },
      'list_vms'
    );
    res.json({ success: true, vms });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Get VM configuration
 */
async function getVMConfig(req, res) {
  try {
    const { name } = req.params;
    const config = await callPythonInstanceMethod(
      'vm_manager',
      'VMManager',
      { repo_root: REPO_ROOT },
      'get_vm_config',
      { vm_name: name }
    );
    
    if (!config) {
      return res.status(404).json({ success: false, error: 'VM not found' });
    }
    
    // Check if running
    const running = await isVMRunning(name);
    
    res.json({ 
      success: true, 
      vm: {
        ...config,
        running
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Create new VM
 */
async function createVM(req, res) {
  try {
    const { name, cpu_cores, ram_gb, disk_size_gb } = req.body;
    
    if (!name || !cpu_cores || !ram_gb || !disk_size_gb) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: name, cpu_cores, ram_gb, disk_size_gb' 
      });
    }
    
    // Step 1: Create VM config
    const created = await callPythonInstanceMethod(
      'vm_manager',
      'VMManager',
      { repo_root: REPO_ROOT },
      'create_vm',
      { name, cpu_cores, ram_gb, disk_size_gb }
    );
    
    if (!created) {
      return res.status(400).json({ 
        success: false, 
        error: 'Failed to create VM. It may already exist.' 
      });
    }
    
    res.json({ success: true, message: 'VM configuration created' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Edit VM configuration
 */
async function editVM(req, res) {
  try {
    const { name } = req.params;
    const { new_name, cpu_cores, ram_gb } = req.body;
    
    const result = await callPythonInstanceMethod(
      'vm_manager',
      'VMManager',
      { repo_root: REPO_ROOT },
      'edit_vm',
      { old_name: name, new_name: new_name || name, cpu_cores, ram_gb }
    );
    
    if (!result) {
      return res.status(400).json({ success: false, error: 'Failed to update VM' });
    }
    
    res.json({ success: true, message: 'VM updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Delete VM
 */
async function deleteVM(req, res) {
  try {
    const { name } = req.params;
    
    const result = await callPythonInstanceMethod(
      'vm_manager',
      'VMManager',
      { repo_root: REPO_ROOT },
      'delete_vm',
      { name }
    );
    
    if (!result) {
      return res.status(400).json({ success: false, error: 'Failed to delete VM' });
    }
    
    res.json({ success: true, message: 'VM deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Get VM status
 */
async function getVMStatus(req, res) {
  try {
    const { name } = req.params;
    const running = await isVMRunning(name);
    res.json({ success: true, running });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Start VM
 */
async function startVM(req, res) {
  try {
    const { name } = req.params;
    
    // Get VM config - need to convert to dict format
    const configData = await callPythonInstanceMethod(
      'vm_manager',
      'VMManager',
      { repo_root: REPO_ROOT },
      'get_vm_config',
      { vm_name: name }
    );
    
    if (!configData) {
      return res.status(404).json({ success: false, error: 'VM not found' });
    }
    
    // Check if already running
    const running = await isVMRunning(name);
    if (running) {
      return res.json({ success: true, message: 'VM is already running' });
    }
    
    // Convert config to dict format for Python
    const config = {
      name: configData.name,
      cpu_cores: configData.cpu_cores,
      ram_gb: configData.ram_gb,
      disk_size_gb: configData.disk_size_gb,
      network: configData.network || 'user',
      created: configData.created
    };
    
    // Start VM
    await operations.startVM(name, config);
    
    res.json({ success: true, message: 'VM started successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Stop VM
 */
async function stopVM(req, res) {
  try {
    const { name } = req.params;
    
    const running = await isVMRunning(name);
    if (!running) {
      return res.json({ success: true, message: 'VM is already stopped' });
    }
    
    await operations.stopVM(name);
    
    res.json({ success: true, message: 'VM stopped successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Get websockify port for VM viewer
 */
async function getViewerPort(req, res) {
  try {
    const { name } = req.params;
    
    const running = await isVMRunning(name);
    if (!running) {
      return res.status(400).json({ success: false, error: 'VM is not running' });
    }
    
    const port = await operations.startWebsockify(name);
    res.json({ success: true, port });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Check if VM desktop is ready
 */
async function checkDesktopReady(req, res) {
  try {
    const { name } = req.params;
    
    const result = await operations.checkDesktopReady(name);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  listVMs,
  getVMConfig,
  createVM,
  editVM,
  deleteVM,
  getVMStatus,
  startVM,
  stopVM,
  getViewerPort,
  checkDesktopReady
};

