/**
 * Main Application - Orchestrates all components
 * Follows OOP, KISS, and modular design
 */
class VMManagerApp {
  constructor() {
    this.services = services;
    this.vmService = this.services.get('vm');
    this.vmList = null;
    this.createDialog = null;
    this.editDialog = null;
    this.viewer = null;
  }

  async init() {
    this.initializeComponents();
    this.attachGlobalEventListeners();
    await this.load();
  }

  initializeComponents() {
    // Initialize VM List
    this.vmList = new VMList('vm-list-container', this.vmService);
    this.vmList.init();
    this.vmList.startAutoUpdate(2000);

    // Initialize Dialogs
    this.createDialog = new VMDialog('create-dialog', 'create');
    this.createDialog.init();

    this.editDialog = new VMDialog('edit-dialog', 'edit');
    this.editDialog.init();

    // Initialize Viewer
    this.viewer = new VMViewer();
    
    // Attach close button
    const closeBtn = document.getElementById('close-viewer-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.viewer.close();
      });
    }
  }

  attachGlobalEventListeners() {
    // Create VM button
    const createBtn = document.getElementById('create-vm-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        this.showCreateDialog();
      });
    }

    // VM action handler
    document.addEventListener('vm-action', (e) => {
      this.handleVMAction(e.detail.action, e.detail.name, e.detail.running);
    });
  }

  async load() {
    await this.vmList.load();
  }

  showCreateDialog() {
    this.createDialog.show(null, async (data) => {
      await this.createVM(data);
    });
  }

  async createVM(config) {
    try {
      // Create VM config
      await this.vmService.create(config);
      
      // Refresh list to show new VM
      await this.vmList.load();
      
      // Start async creation workflow
      this.startVMCreationWorkflow(config.name, config);
    } catch (error) {
      alert('Failed to create VM: ' + error.message);
    }
  }

  async startVMCreationWorkflow(name, config) {
    try {
      // Sequential workflow - each step waits for the previous to complete
      console.log(`Starting VM creation workflow for ${name}`);
      
      // Step 1: Create disk
      console.log(`Creating disk for ${name}...`);
      await this.vmService.createDisk(name, config.disk_size_gb);
      
      // Step 2: Download ISO (if needed)
      console.log(`Downloading ISO for ${name}...`);
      await this.vmService.downloadISO(name);
      
      // Step 3: Prepare ISO
      console.log(`Preparing ISO for ${name}...`);
      await this.vmService.prepareISO(name);
      
      console.log(`VM creation workflow completed for ${name}`);
      
      // Clear progress after a delay to show "Ready" status
      setTimeout(async () => {
        await this.vmList.load();
        // Keep progress visible for a bit longer so user sees "Ready"
        setTimeout(() => {
          // Progress will be cleared when VM is started or after timeout
        }, 5000);
      }, 2000);
    } catch (error) {
      console.error('VM creation workflow error:', error);
      // Show error to user
      alert(`VM creation failed: ${error.message}`);
    }
  }

  async handleVMAction(action, name, running) {
    switch (action) {
      case 'toggle':
        await this.toggleVM(name, running);
        break;
      case 'view':
        await this.viewVM(name);
        break;
      case 'edit':
        await this.showEditDialog(name);
        break;
      case 'delete':
        await this.deleteVM(name);
        break;
    }
  }

  async toggleVM(name, running) {
    try {
      if (running) {
        await this.vmService.stop(name);
      } else {
        await this.vmService.start(name);
      }
      await this.vmList.load();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  }

  async viewVM(name) {
    try {
      const status = await this.vmService.getStatus(name);
      let port = null;
      
      if (status) {
        port = await this.vmService.getViewerPort(name);
      }
      
      this.viewer.open(name, port);
    } catch (error) {
      alert('Error: ' + error.message);
    }
  }

  async showEditDialog(name) {
    try {
      const vm = await this.vmService.getFullVMData(name);
      this.editDialog.show(vm, async (data, oldVM) => {
        await this.updateVM(name, data);
      });
    } catch (error) {
      alert('Failed to load VM: ' + error.message);
    }
  }

  async updateVM(oldName, config) {
    try {
      await this.vmService.update(oldName, {
        new_name: config.name,
        cpu_cores: config.cpu_cores,
        ram_gb: config.ram_gb
      });
      await this.vmList.load();
    } catch (error) {
      alert('Failed to update VM: ' + error.message);
    }
  }

  async deleteVM(name) {
    if (!confirm(`Are you sure you want to delete VM '${name}'? This cannot be undone.`)) {
      return;
    }

    try {
      await this.vmService.delete(name);
      await this.vmList.load();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new VMManagerApp();
  app.init();
  window.vmManagerApp = app; // Make available globally for debugging
});
