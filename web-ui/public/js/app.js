/**
 * Main Application Logic
 */

const API_BASE = '/api';

let currentEditVM = null;
let rfb = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadVMList();
  
  // Poll for VM status updates
  setInterval(loadVMList, 5000);
});

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Create VM button
  document.getElementById('create-vm-btn').addEventListener('click', () => {
    showCreateDialog();
  });

  // Create dialog
  document.getElementById('cancel-create-btn').addEventListener('click', () => {
    hideCreateDialog();
  });

  document.getElementById('confirm-create-btn').addEventListener('click', () => {
    createVM();
  });

  // CPU/RAM sliders
  document.getElementById('vm-cpu').addEventListener('input', (e) => {
    document.getElementById('cpu-value').textContent = `${e.target.value} cores`;
  });

  document.getElementById('vm-ram').addEventListener('input', (e) => {
    document.getElementById('ram-value').textContent = `${e.target.value} GB`;
  });

  // Edit dialog
  document.getElementById('cancel-edit-btn').addEventListener('click', () => {
    hideEditDialog();
  });

  document.getElementById('confirm-edit-btn').addEventListener('click', () => {
    editVM();
  });

  // Edit CPU/RAM sliders
  document.getElementById('edit-vm-cpu').addEventListener('input', (e) => {
    document.getElementById('edit-cpu-value').textContent = `${e.target.value} cores`;
  });

  document.getElementById('edit-vm-ram').addEventListener('input', (e) => {
    document.getElementById('edit-ram-value').textContent = `${e.target.value} GB`;
  });

  // Viewer close
  document.getElementById('close-viewer-btn').addEventListener('click', () => {
    closeViewer();
  });
}

/**
 * Load VM list
 */
async function loadVMList() {
  try {
    const response = await fetch(`${API_BASE}/vms`);
    const data = await response.json();
    
    if (data.success) {
      displayVMList(data.vms || []);
    } else {
      showError('Failed to load VMs: ' + data.error);
    }
  } catch (error) {
    console.error('Error loading VMs:', error);
    showError('Failed to load VMs');
  }
}

/**
 * Display VM list
 */
async function displayVMList(vms) {
  const container = document.getElementById('vm-list-container');
  
  if (vms.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No VMs found. Click 'Create VM' to get started.</p>
      </div>
    `;
    return;
  }

  // Get status for each VM
  const vmsWithStatus = await Promise.all(
    vms.map(async (name) => {
      try {
        const statusRes = await fetch(`${API_BASE}/vms/${name}/status`);
        const statusData = await statusRes.json();
        const running = statusData.success && statusData.running;
        
        const configRes = await fetch(`${API_BASE}/vms/${name}`);
        const configData = await configRes.json();
        const config = configData.success ? configData.vm : null;
        
        return { name, running, config };
      } catch (error) {
        return { name, running: false, config: null };
      }
    })
  );

  container.innerHTML = '<div class="vm-list"></div>';
  const vmList = container.querySelector('.vm-list');

  vmsWithStatus.forEach(({ name, running, config }) => {
    const card = createVMCard(name, running, config);
    vmList.appendChild(card);
  });
}

/**
 * Create VM card element
 */
function createVMCard(name, running, config) {
  const card = document.createElement('div');
  card.className = 'vm-card';
  
  const cpu = config?.cpu_cores || 'N/A';
  const ram = config?.ram_gb || 'N/A';
  const disk = config?.disk_size_gb || 'N/A';
  
  card.innerHTML = `
    <div class="vm-card-header">
      <div class="vm-name">${name}</div>
      <div class="vm-status ${running ? 'running' : ''}">${running ? 'Running' : 'Stopped'}</div>
    </div>
    <div class="vm-specs">
      <span>CPU: ${cpu} cores</span>
      <span>RAM: ${ram} GB</span>
      <span>Disk: ${disk} GB</span>
    </div>
    <div class="vm-actions">
      <button class="btn ${running ? 'btn-danger' : ''}" onclick="toggleVM('${name}', ${running})">
        ${running ? 'Stop' : 'Start'}
      </button>
      <button class="btn btn-secondary" onclick="viewVM('${name}')" ${!running ? 'disabled' : ''}>
        View
      </button>
      <button class="btn btn-secondary" onclick="editVMDialog('${name}')">Edit</button>
      <button class="btn btn-danger" onclick="deleteVM('${name}')">Delete</button>
    </div>
  `;
  
  return card;
}

/**
 * Show create dialog
 */
function showCreateDialog() {
  document.getElementById('create-dialog').classList.add('active');
  document.getElementById('vm-name').value = '';
  document.getElementById('vm-cpu').value = 8;
  document.getElementById('vm-ram').value = 8;
  document.getElementById('vm-disk').value = 64;
  document.getElementById('cpu-value').textContent = '8 cores';
  document.getElementById('ram-value').textContent = '8 GB';
  document.getElementById('create-progress').style.display = 'none';
  document.getElementById('create-error').style.display = 'none';
}

/**
 * Hide create dialog
 */
function hideCreateDialog() {
  document.getElementById('create-dialog').classList.remove('active');
}

/**
 * Create VM
 */
async function createVM() {
  const name = document.getElementById('vm-name').value.trim();
  const cpu = parseInt(document.getElementById('vm-cpu').value);
  const ram = parseInt(document.getElementById('vm-ram').value);
  const disk = parseInt(document.getElementById('vm-disk').value);

  if (!name) {
    showCreateError('VM name is required');
    return;
  }

  if (disk < 20) {
    showCreateError('Disk size must be at least 20 GB');
    return;
  }

  const progressDiv = document.getElementById('create-progress');
  const errorDiv = document.getElementById('create-error');
  errorDiv.style.display = 'none';
  progressDiv.style.display = 'block';

  try {
    // Step 1: Create VM config
    updateProgress(0, 'Creating VM configuration...');
    const createRes = await fetch(`${API_BASE}/vms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, cpu_cores: cpu, ram_gb: ram, disk_size_gb: disk })
    });

    const createData = await createRes.json();
    if (!createData.success) {
      throw new Error(createData.error || 'Failed to create VM');
    }

    // Step 2: Create disk
    updateProgress(25, 'Creating disk image...');
    const diskRes = await fetch(`${API_BASE}/vms/${name}/create-disk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disk_size_gb: disk })
    });

    const diskData = await diskRes.json();
    if (!diskData.success) {
      throw new Error(diskData.error || 'Failed to create disk');
    }

    // Step 3: Download ISO
    updateProgress(50, 'Downloading Windows ISO...');
    const isoRes = await fetch(`${API_BASE}/download-iso`, {
      method: 'POST'
    });

    const isoData = await isoRes.json();
    if (!isoData.success) {
      throw new Error(isoData.error || 'Failed to download ISO');
    }

    // Step 4: Prepare ISO
    updateProgress(75, 'Preparing modified ISO (this may take several minutes)...');
    const prepareRes = await fetch(`${API_BASE}/vms/${name}/prepare-iso`, {
      method: 'POST'
    });

    const prepareData = await prepareRes.json();
    if (!prepareData.success) {
      throw new Error(prepareData.error || 'Failed to prepare ISO');
    }

    // Success
    updateProgress(100, 'VM created successfully!');
    setTimeout(() => {
      hideCreateDialog();
      loadVMList();
    }, 1000);

  } catch (error) {
    showCreateError(error.message);
  }
}

/**
 * Update progress
 */
function updateProgress(percent, message) {
  document.getElementById('progress-fill').style.width = `${percent}%`;
  document.getElementById('progress-text').textContent = message;
}

/**
 * Show create error
 */
function showCreateError(message) {
  const errorDiv = document.getElementById('create-error');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
  document.getElementById('create-progress').style.display = 'none';
}

/**
 * Toggle VM (start/stop)
 */
async function toggleVM(name, isRunning) {
  try {
    const endpoint = isRunning ? 'stop' : 'start';
    const response = await fetch(`${API_BASE}/vms/${name}/${endpoint}`, {
      method: 'POST'
    });

    const data = await response.json();
    if (data.success) {
      loadVMList();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

/**
 * View VM
 */
async function viewVM(name) {
  try {
    const response = await fetch(`${API_BASE}/vms/${name}/viewer-port`);
    const data = await response.json();
    
    if (data.success && data.port) {
      openViewer(name, data.port);
    } else {
      alert('Failed to get viewer port: ' + (data.error || 'Unknown error'));
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

/**
 * Open viewer
 */
function openViewer(vmName, port) {
  document.getElementById('viewer-title').textContent = `VM Viewer - ${vmName}`;
  document.getElementById('viewer-container').classList.add('active');
  
  if (typeof initNoVNC === 'function') {
    initNoVNC(port);
  }
}

/**
 * Close viewer
 */
function closeViewer() {
  document.getElementById('viewer-container').classList.remove('active');
  if (rfb) {
    rfb.disconnect();
    rfb = null;
  }
}

/**
 * Edit VM dialog
 */
async function editVMDialog(name) {
  try {
    const response = await fetch(`${API_BASE}/vms/${name}`);
    const data = await response.json();
    
    if (!data.success || !data.vm) {
      alert('Failed to load VM config');
      return;
    }

    const config = data.vm;
    currentEditVM = name;
    
    document.getElementById('edit-vm-name').value = config.name;
    document.getElementById('edit-vm-cpu').value = config.cpu_cores;
    document.getElementById('edit-vm-ram').value = config.ram_gb;
    document.getElementById('edit-vm-disk').value = config.disk_size_gb;
    document.getElementById('edit-cpu-value').textContent = `${config.cpu_cores} cores`;
    document.getElementById('edit-ram-value').textContent = `${config.ram_gb} GB`;
    document.getElementById('edit-error').style.display = 'none';
    
    document.getElementById('edit-dialog').classList.add('active');
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

/**
 * Hide edit dialog
 */
function hideEditDialog() {
  document.getElementById('edit-dialog').classList.remove('active');
  currentEditVM = null;
}

/**
 * Edit VM
 */
async function editVM() {
  if (!currentEditVM) return;

  const newName = document.getElementById('edit-vm-name').value.trim();
  const cpu = parseInt(document.getElementById('edit-vm-cpu').value);
  const ram = parseInt(document.getElementById('edit-vm-ram').value);

  if (!newName) {
    document.getElementById('edit-error').textContent = 'VM name is required';
    document.getElementById('edit-error').style.display = 'block';
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/vms/${currentEditVM}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_name: newName, cpu_cores: cpu, ram_gb: ram })
    });

    const data = await response.json();
    if (data.success) {
      hideEditDialog();
      loadVMList();
    } else {
      document.getElementById('edit-error').textContent = data.error || 'Failed to update VM';
      document.getElementById('edit-error').style.display = 'block';
    }
  } catch (error) {
    document.getElementById('edit-error').textContent = error.message;
    document.getElementById('edit-error').style.display = 'block';
  }
}

/**
 * Delete VM
 */
async function deleteVM(name) {
  if (!confirm(`Are you sure you want to delete VM '${name}'? This cannot be undone.`)) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/vms/${name}`, {
      method: 'DELETE'
    });

    const data = await response.json();
    if (data.success) {
      loadVMList();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

/**
 * Show error message
 */
function showError(message) {
  console.error(message);
  // Could add a toast notification here
}

// Make functions available globally
window.toggleVM = toggleVM;
window.viewVM = viewVM;
window.editVMDialog = editVMDialog;
window.deleteVM = deleteVM;

