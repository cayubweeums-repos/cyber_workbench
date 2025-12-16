/**
 * Main Application - Orchestrates all components
 * Follows OOP, KISS, and modular design
 */
class VMManagerApp {
  constructor() {
    this.services = services;
    this.vmService = this.services.get('vm');
    this.environmentService = this.services.get('environment');
    this.vmList = null;
    this.environmentList = null;
    this.createDialog = null;
    this.editDialog = null;
    this.environmentWizard = null;
    this.viewer = null;
    this.environmentViewer = null;
    this.navSidebar = null;
    this.currentView = 'environments'; // Default to environments view
  }

  async init() {
    this.initializeComponents();
    this.attachGlobalEventListeners();
    this.showView('environments'); // Show environments view by default
    await this.load();
  }

  initializeComponents() {
    // Initialize Navigation Sidebar
    this.navSidebar = new NavigationSidebar('nav-sidebar-container');
    this.navSidebar.init();

    // Initialize Environment List (for Environments view)
    this.environmentList = new EnvironmentList('environment-list-container', this.environmentService);
    this.environmentList.init();
    this.environmentList.startAutoUpdate(2000);

    // Initialize VM List (for VMs view)
    this.vmList = new VMList('vm-list-container', this.vmService);
    this.vmList.init();
    this.vmList.startAutoUpdate(2000);

    // Initialize Dialogs
    this.createDialog = new VMDialog('create-dialog', 'create');
    this.createDialog.init();

    this.editDialog = new VMDialog('edit-dialog', 'edit');
    this.editDialog.init();

    // Initialize Environment Wizard
    this.environmentWizard = new EnvironmentWizard('environment-wizard');
    this.environmentWizard.init();

    // Initialize Viewers
    this.viewer = new VMViewer();
    this.environmentViewer = new EnvironmentViewer('environment-viewer-container');
    this.environmentViewer.init();
    
    // Attach close button
    const closeBtn = document.getElementById('close-viewer-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.viewer.close();
      });
    }
  }

  attachGlobalEventListeners() {
    // Navigation change handler
    document.addEventListener('nav-change', (e) => {
      this.showView(e.detail.view);
    });

    // Create VM button (in VMs view)
    const createBtn = document.getElementById('create-vm-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        this.showCreateDialog();
      });
    }

    // Advanced Mode toggle (the joke) - sync both toggles
    const advancedToggles = [
      document.getElementById('advanced-mode-toggle'),
      document.getElementById('advanced-mode-toggle-vms')
    ];
    advancedToggles.forEach(toggle => {
      if (toggle) {
        toggle.addEventListener('change', (e) => {
          const isChecked = e.target.checked;
          // Sync both toggles
          advancedToggles.forEach(t => {
            if (t) t.checked = isChecked;
          });
          if (isChecked) {
            document.body.classList.add('advanced-mode');
          } else {
            document.body.classList.remove('advanced-mode');
          }
        });
      }
    });

    // Create Environment button (in Environments view)
    const createEnvBtn = document.getElementById('create-environment-btn');
    if (createEnvBtn) {
      createEnvBtn.addEventListener('click', () => {
        this.showEnvironmentWizard();
      });
    }

    // VM action handler
    document.addEventListener('vm-action', (e) => {
      this.handleVMAction(e.detail.action, e.detail.name, e.detail.running);
    });

    // Environment action handler
    document.addEventListener('environment-action', (e) => {
      this.handleEnvironmentAction(e.detail.action, e.detail.name, e.detail.running);
    });
  }

  showView(viewName) {
    this.currentView = viewName;
    
    // Update sidebar active state
    if (this.navSidebar) {
      this.navSidebar.setActiveView(viewName);
    }
    
    // Show/hide appropriate views
    const environmentsView = document.getElementById('environments-view');
    const vmsView = document.getElementById('vms-view');
    
    if (viewName === 'environments') {
      if (environmentsView) environmentsView.style.display = 'block';
      if (vmsView) vmsView.style.display = 'none';
      // Load environments when switching to Environments view
      if (this.environmentList) {
        this.environmentList.load();
      }
    } else if (viewName === 'vms') {
      if (environmentsView) environmentsView.style.display = 'none';
      if (vmsView) vmsView.style.display = 'block';
      // Load VMs when switching to VMs view
      if (this.vmList) {
        this.vmList.load();
      }
    }
  }

  async handleEnvironmentAction(action, name, running) {
    switch (action) {
      case 'toggle':
        await this.toggleEnvironment(name, running);
        break;
      case 'view':
        await this.viewEnvironment(name);
        break;
      case 'delete':
        await this.deleteEnvironment(name);
        break;
    }
  }

  async toggleEnvironment(name, running) {
    try {
      // Show resource warning before starting
      if (!running) {
        const environment = await this.environmentService.getFullEnvironmentData(name);
        if (environment) {
          const resources = environment.getTotalResources();
          const message = `Make sure you have sufficient resources (CPU, RAM, disk) available before starting this environment. Starting will consume:\n\nCPU: ${resources.cpu_cores} cores\nRAM: ${resources.ram_gb} GB\nDisk: ${resources.disk_size_gb} GB`;
          
          if (!confirm(message)) {
            return;
          }
        }
      }

      if (running) {
        await this.environmentService.stop(name);
      } else {
        await this.environmentService.start(name);
      }
      await this.environmentList.load();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  }

  async viewEnvironment(name) {
    try {
      this.environmentViewer.open(name, this.environmentService);
    } catch (error) {
      alert('Error: ' + error.message);
    }
  }

  async deleteEnvironment(name) {
    if (!confirm(`Are you sure you want to delete environment '${name}'? This cannot be undone.`)) {
      return;
    }

    try {
      await this.environmentService.delete(name);
      await this.environmentList.load();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  }

  async load() {
    // Load based on current view
    if (this.currentView === 'environments' && this.environmentList) {
      await this.environmentList.load();
    } else if (this.currentView === 'vms' && this.vmList) {
      await this.vmList.load();
    }
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
      
      // Step 3: Prepare ISO (sudo password provided at server startup)
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
      // Show detailed error to user
      alert(`VM creation failed: ${error.message}\n\nCheck the browser console for detailed logs.`);
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

  showEnvironmentWizard() {
    this.environmentWizard.show(async (config) => {
      await this.createEnvironment(config);
    });
  }

  async createEnvironment(config) {
    try {
      // Create environment config
      await this.environmentService.create(config);
      
      // Refresh list to show new environment
      await this.environmentList.load();
    } catch (error) {
      alert('Failed to create environment: ' + error.message);
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new VMManagerApp();
  app.init();
  window.vmManagerApp = app; // Make available globally for debugging
});
