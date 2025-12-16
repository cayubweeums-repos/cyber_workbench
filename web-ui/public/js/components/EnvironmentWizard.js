/**
 * Environment Wizard Component - Multi-step wizard for creating environments
 * Follows BaseComponent pattern
 */
class EnvironmentWizard extends BaseComponent {
  constructor(dialogId) {
    const container = document.getElementById(dialogId);
    super(container);
    this.currentStep = 1;
    this.totalSteps = 4;
    this.environmentData = {
      name: '',
      services: [],
      networks: [],
      tools: {} // service name -> tool configs
    };
    this.onConfirm = null;
  }

  render() {
    // Dialog HTML is already in the page, just manage state
  }

  attachEventListeners() {
    if (!this.container) return;

    // Use event delegation for buttons
    this.container.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action === 'cancel') {
        this.hide();
      } else if (action === 'next') {
        this.nextStep();
      } else if (action === 'back') {
        this.prevStep();
      } else if (action === 'confirm') {
        this.handleConfirm();
      } else if (action === 'add-service') {
        this.addService();
      } else if (action === 'remove-service') {
        const index = parseInt(e.target.dataset.index);
        this.removeService(index);
      } else if (action === 'add-network') {
        this.addNetwork();
      } else if (action === 'remove-network') {
        const index = parseInt(e.target.dataset.index);
        this.removeNetwork(index);
      }
    });

    // Handle tool checkbox changes to show/hide input fields
    this.container.addEventListener('change', (e) => {
      if (e.target.classList.contains('tool-enabled')) {
        const toolItem = e.target.closest('.wizard-tool-item');
        const toolInputs = toolItem.querySelector('.tool-inputs');
        if (e.target.checked) {
          if (!toolInputs) {
            // Re-render to show inputs
            this.renderStep();
          }
        } else {
          if (toolInputs) {
            toolInputs.style.display = 'none';
          }
        }
      }
    });

    // Handle input changes - update data model in real-time
    this.container.addEventListener('input', (e) => {
      if (e.target.id === 'env-name') {
        this.environmentData.name = e.target.value;
      } else if (e.target.classList.contains('service-name')) {
        const index = parseInt(e.target.dataset.index);
        if (!isNaN(index) && this.environmentData.services[index]) {
          this.environmentData.services[index].name = e.target.value;
        }
      } else if (e.target.classList.contains('service-cpu')) {
        const index = parseInt(e.target.dataset.index);
        if (!isNaN(index) && this.environmentData.services[index]) {
          this.environmentData.services[index].cpu_cores = parseInt(e.target.value) || 8;
        }
      } else if (e.target.classList.contains('service-ram')) {
        const index = parseInt(e.target.dataset.index);
        if (!isNaN(index) && this.environmentData.services[index]) {
          this.environmentData.services[index].ram_gb = parseInt(e.target.value) || 8;
        }
      } else if (e.target.classList.contains('service-disk')) {
        const index = parseInt(e.target.dataset.index);
        if (!isNaN(index) && this.environmentData.services[index]) {
          this.environmentData.services[index].disk_size_gb = parseInt(e.target.value) || 64;
        }
      } else if (e.target.classList.contains('service-type')) {
        const index = parseInt(e.target.dataset.index);
        if (!isNaN(index) && this.environmentData.services[index]) {
          this.environmentData.services[index].type = e.target.value;
        }
      }
    });

    // Handle select changes
    this.container.addEventListener('change', (e) => {
      if (e.target.classList.contains('service-type')) {
        const index = parseInt(e.target.dataset.index);
        if (!isNaN(index) && this.environmentData.services[index]) {
          this.environmentData.services[index].type = e.target.value;
        }
      }
    });
  }

  show(onConfirm = null) {
    this.onConfirm = onConfirm;
    this.currentStep = 1;
    this.environmentData = {
      name: '',
      services: [],
      networks: [],
      tools: {}
    };
    this.renderStep();
    this.container.classList.add('active');
  }

  hide() {
    this.container.classList.remove('active');
    this.onConfirm = null;
  }

  renderStep() {
    if (!this.container) return;

    const stepContent = this.container.querySelector('.wizard-content');
    if (!stepContent) return;

    // Update progress indicator
    const progress = this.container.querySelector('.wizard-progress');
    if (progress) {
      progress.textContent = `Step ${this.currentStep} of ${this.totalSteps}`;
    }

    // Render step content
    switch (this.currentStep) {
      case 1:
        stepContent.innerHTML = this.renderServiceSelection();
        break;
      case 2:
        stepContent.innerHTML = this.renderNetworkConfiguration();
        break;
      case 3:
        stepContent.innerHTML = this.renderToolConfiguration();
        break;
      case 4:
        stepContent.innerHTML = this.renderReview();
        break;
    }

    // Update navigation buttons
    this.updateNavigationButtons();
  }

  renderServiceSelection() {
    const serviceTypeKeys = Object.keys(serviceTypeRegistry.types);
    let servicesHTML = '';

    this.environmentData.services.forEach((service, index) => {
      const serviceType = serviceTypeRegistry.get(service.type);
      servicesHTML += `
        <div class="wizard-service-item" data-index="${index}">
          <div class="wizard-service-header">
            <h4>Service ${index + 1}: ${service.name || 'Unnamed'}</h4>
            <button type="button" class="btn btn-danger btn-small" data-action="remove-service" data-index="${index}">Remove</button>
          </div>
          <div class="form-group">
            <label>Service Name</label>
            <input type="text" class="service-name" data-index="${index}" value="${service.name || ''}" placeholder="Enter service name">
          </div>
          <div class="form-group">
            <label>Service Type</label>
            <select class="service-type" data-index="${index}">
              ${Object.keys(serviceTypeRegistry.types).map(typeKey => {
                const st = serviceTypeRegistry.types[typeKey];
                return `<option value="${typeKey}" ${service.type === typeKey ? 'selected' : ''}>${st.name}</option>`;
              }).join('')}
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>CPU Cores</label>
              <input type="number" class="service-cpu" data-index="${index}" min="1" value="${service.cpu_cores || 8}">
            </div>
            <div class="form-group">
              <label>RAM (GB)</label>
              <input type="number" class="service-ram" data-index="${index}" min="2" value="${service.ram_gb || 8}">
            </div>
            <div class="form-group">
              <label>Disk Size (GB)</label>
              <input type="number" class="service-disk" data-index="${index}" min="20" value="${service.disk_size_gb || 64}">
            </div>
          </div>
        </div>
      `;
    });

    return `
      <h3>Service Selection</h3>
      <div class="form-group">
        <label for="env-name">Environment Name</label>
        <input type="text" id="env-name" value="${this.environmentData.name}" placeholder="Enter environment name" required>
      </div>
      <div class="wizard-services">
        ${servicesHTML || '<p class="empty-state">No services added yet. Click "Add Service" to get started.</p>'}
      </div>
      <button type="button" class="btn btn-secondary" data-action="add-service">Add Service</button>
    `;
  }

  renderNetworkConfiguration() {
    let networksHTML = '';

    this.environmentData.networks.forEach((network, index) => {
      networksHTML += `
        <div class="wizard-network-item" data-index="${index}">
          <div class="wizard-network-header">
            <h4>Network ${index + 1}: ${network.name || 'Unnamed'}</h4>
            <button type="button" class="btn btn-danger btn-small" data-action="remove-network" data-index="${index}">Remove</button>
          </div>
          <div class="form-group">
            <label>Network Name</label>
            <input type="text" class="network-name" data-index="${index}" value="${network.name || ''}" placeholder="Enter network name">
          </div>
          <div class="form-group">
            <label>Assign Services</label>
            <div class="network-services">
              ${this.environmentData.services.map((service, sIndex) => `
                <label>
                  <input type="checkbox" class="network-service" data-network="${index}" data-service="${sIndex}" ${service.network === network.name ? 'checked' : ''}>
                  ${service.name || `Service ${sIndex + 1}`}
                </label>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    });

    return `
      <h3>Network Configuration</h3>
      <div class="wizard-networks">
        ${networksHTML || '<p class="empty-state">No networks added yet. Click "Add Network" to get started.</p>'}
      </div>
      <button type="button" class="btn btn-secondary" data-action="add-network">Add Network</button>
    `;
  }

  renderToolConfiguration() {
    let toolsHTML = '';

    this.environmentData.services.forEach((service, sIndex) => {
      const serviceType = serviceTypeRegistry.get(service.type);
      if (!serviceType) {
        toolsHTML += `
          <div class="wizard-service-tools" data-service="${sIndex}">
            <h4>${service.name || `Service ${sIndex + 1}`}</h4>
            <p class="empty-state">Unknown service type: ${service.type}</p>
          </div>
        `;
        return;
      }
      const availableTools = ToolRegistry.getToolsForServiceType(service.type);
      
      if (availableTools.length === 0) {
        toolsHTML += `
          <div class="wizard-service-tools" data-service="${sIndex}">
            <h4>${service.name || `Service ${sIndex + 1}`}</h4>
            <p class="empty-state">No tools available for ${serviceType.name}</p>
          </div>
        `;
        return;
      }

      let toolItemsHTML = '';
      availableTools.forEach(tool => {
        const toolConfig = this.environmentData.tools[service.name] || {};
        const toolData = toolConfig[tool.name] || {};
        const isSelected = toolData.enabled || false;

        let inputFieldsHTML = '';
        if (tool.requiresInput && tool.requiresInput.fields) {
          tool.requiresInput.fields.forEach(field => {
            inputFieldsHTML += `
              <div class="form-group">
                <label>${field.label}</label>
                <input type="${field.type}" 
                       class="tool-input" 
                       data-service="${sIndex}" 
                       data-tool="${tool.name}" 
                       data-field="${field.name}"
                       value="${toolData[field.name] || ''}"
                       placeholder="${field.placeholder || ''}"
                       ${field.required ? 'required' : ''}>
              </div>
            `;
          });
        }

        toolItemsHTML += `
          <div class="wizard-tool-item">
            <label>
              <input type="checkbox" 
                     class="tool-enabled" 
                     data-service="${sIndex}" 
                     data-tool="${tool.name}"
                     ${isSelected ? 'checked' : ''}>
              <strong>${tool.name}</strong>
            </label>
            <p class="tool-description">${tool.description}</p>
            ${isSelected ? `<div class="tool-inputs">${inputFieldsHTML}</div>` : ''}
          </div>
        `;
      });

      toolsHTML += `
        <div class="wizard-service-tools" data-service="${sIndex}">
          <h4>${service.name || `Service ${sIndex + 1}`}</h4>
          ${toolItemsHTML}
        </div>
      `;
    });

    return `
      <h3>Tool Configuration</h3>
      <div class="wizard-tools">
        ${toolsHTML || '<p class="empty-state">No services configured. Go back to add services.</p>'}
      </div>
    `;
  }

  renderReview() {
    const resources = this.environmentData.services.reduce((total, service) => ({
      cpu_cores: total.cpu_cores + (service.cpu_cores || 0),
      ram_gb: total.ram_gb + (service.ram_gb || 0),
      disk_size_gb: total.disk_size_gb + (service.disk_size_gb || 0)
    }), { cpu_cores: 0, ram_gb: 0, disk_size_gb: 0 });

    return `
      <h3>Review</h3>
      <div class="review-section">
        <h4>Environment: ${this.environmentData.name}</h4>
        <div class="review-item">
          <strong>Services:</strong> ${this.environmentData.services.length}
          <ul>
            ${this.environmentData.services.map(s => `<li>${s.name} (${s.type}) - ${s.cpu_cores} CPU, ${s.ram_gb} GB RAM, ${s.disk_size_gb} GB Disk</li>`).join('')}
          </ul>
        </div>
        <div class="review-item">
          <strong>Networks:</strong> ${this.environmentData.networks.length}
          <ul>
            ${this.environmentData.networks.map(n => `<li>${n.name}</li>`).join('')}
          </ul>
        </div>
        <div class="review-item">
          <strong>Total Resources:</strong>
          <ul>
            <li>CPU: ${resources.cpu_cores} cores</li>
            <li>RAM: ${resources.ram_gb} GB</li>
            <li>Disk: ${resources.disk_size_gb} GB</li>
          </ul>
        </div>
      </div>
    `;
  }

  updateNavigationButtons() {
    const backBtn = this.container.querySelector('[data-action="back"]');
    const nextBtn = this.container.querySelector('[data-action="next"]');
    const confirmBtn = this.container.querySelector('[data-action="confirm"]');

    if (backBtn) {
      backBtn.style.display = this.currentStep > 1 ? 'inline-block' : 'none';
    }
    if (nextBtn) {
      nextBtn.style.display = this.currentStep < this.totalSteps ? 'inline-block' : 'none';
    }
    if (confirmBtn) {
      confirmBtn.style.display = this.currentStep === this.totalSteps ? 'inline-block' : 'none';
    }
  }

  nextStep() {
    // Save current step data first to ensure data model is up to date
    this.saveCurrentStepData();
    
    // Then validate
    if (!this.validateCurrentStep()) {
      return;
    }
    
    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
      this.renderStep();
    }
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.renderStep();
    }
  }

  validateCurrentStep() {
    // Always validate from data model (which should be up to date after saveCurrentStepData)
    switch (this.currentStep) {
      case 1:
        // Double-check by reading from DOM as well
        const stepContent = this.container.querySelector('.wizard-content');
        if (stepContent) {
          const envNameInput = stepContent.querySelector('#env-name');
          const envName = envNameInput ? envNameInput.value.trim() : this.environmentData.name;
          if (!envName) {
            alert('Environment name is required');
            return false;
          }
          
          const serviceItems = stepContent.querySelectorAll('.wizard-service-item');
          if (serviceItems.length === 0) {
            alert('At least one service is required');
            return false;
          }
          
          // Validate each service by reading from DOM (most reliable)
          for (let i = 0; i < serviceItems.length; i++) {
            const item = serviceItems[i];
            const nameInput = item.querySelector('.service-name');
            const serviceName = nameInput ? nameInput.value.trim() : '';
            if (!serviceName) {
              alert(`Service ${i + 1} must have a name`);
              // Focus on the input that's missing
              if (nameInput) {
                nameInput.focus();
              }
              return false;
            }
          }
        } else {
          // Fallback to data model validation
          if (!this.environmentData.name || !this.environmentData.name.trim()) {
            alert('Environment name is required');
            return false;
          }
          if (this.environmentData.services.length === 0) {
            alert('At least one service is required');
            return false;
          }
          for (let i = 0; i < this.environmentData.services.length; i++) {
            const service = this.environmentData.services[i];
            if (!service.name || !service.name.trim()) {
              alert(`Service ${i + 1} must have a name`);
              return false;
            }
          }
        }
        break;
      case 2:
        // Networks are optional, but if added, must have names
        for (let i = 0; i < this.environmentData.networks.length; i++) {
          const network = this.environmentData.networks[i];
          if (!network.name || !network.name.trim()) {
            alert(`Network ${i + 1} must have a name`);
            return false;
          }
        }
        break;
      case 3:
        // Tools are optional, validation happens on confirm
        break;
      case 4:
        // Review step, no validation needed
        break;
    }
    return true;
  }

  saveCurrentStepData() {
    const stepContent = this.container.querySelector('.wizard-content');
    if (!stepContent) return;

    switch (this.currentStep) {
      case 1:
        // Save environment name
        const envNameInput = stepContent.querySelector('#env-name');
        if (envNameInput) {
          this.environmentData.name = envNameInput.value.trim();
        }

        // Save service data - read from DOM to ensure we have latest values
        const serviceItems = stepContent.querySelectorAll('.wizard-service-item');
        const savedServices = [];
        
        serviceItems.forEach((item) => {
          const nameInput = item.querySelector('.service-name');
          const typeSelect = item.querySelector('.service-type');
          const cpuInput = item.querySelector('.service-cpu');
          const ramInput = item.querySelector('.service-ram');
          const diskInput = item.querySelector('.service-disk');
          
          const serviceData = {
            name: nameInput ? nameInput.value.trim() : '',
            type: typeSelect ? typeSelect.value : 'WindowsVM',
            cpu_cores: parseInt(cpuInput ? cpuInput.value : 8) || 8,
            ram_gb: parseInt(ramInput ? ramInput.value : 8) || 8,
            disk_size_gb: parseInt(diskInput ? diskInput.value : 64) || 64
          };
          
          // Preserve network assignment if it exists
          const dataIndex = parseInt(item.dataset.index);
          if (!isNaN(dataIndex) && this.environmentData.services[dataIndex]) {
            serviceData.network = this.environmentData.services[dataIndex].network;
          }
          
          savedServices.push(serviceData);
        });
        
        this.environmentData.services = savedServices;
        break;
      case 2:
        // Save network data and assignments
        const networkItems = stepContent.querySelectorAll('.wizard-network-item');
        this.environmentData.networks = Array.from(networkItems).map((item, index) => {
          const nameInput = item.querySelector('.network-name');
          return {
            name: nameInput ? nameInput.value.trim() : '',
            type: 'user' // Default network type
          };
        });
        
        // Update service network assignments
        networkItems.forEach((item, nIndex) => {
          const checkboxes = item.querySelectorAll('.network-service:checked');
          checkboxes.forEach(checkbox => {
            const sIndex = parseInt(checkbox.dataset.service);
            const networkName = this.environmentData.networks[nIndex].name;
            if (this.environmentData.services[sIndex]) {
              this.environmentData.services[sIndex].network = networkName;
            }
          });
        });
        break;
      case 3:
        // Save tool configurations
        const serviceTools = stepContent.querySelectorAll('.wizard-service-tools');
        serviceTools.forEach(serviceTool => {
          const sIndex = parseInt(serviceTool.dataset.service);
          const service = this.environmentData.services[sIndex];
          if (!service) return;

          if (!this.environmentData.tools[service.name]) {
            this.environmentData.tools[service.name] = {};
          }

          const toolItems = serviceTool.querySelectorAll('.wizard-tool-item');
          toolItems.forEach(toolItem => {
            const enabledCheckbox = toolItem.querySelector('.tool-enabled');
            const toolName = enabledCheckbox ? enabledCheckbox.dataset.tool : null;
            
            if (!toolName) return;

            const isEnabled = enabledCheckbox ? enabledCheckbox.checked : false;
            
            if (isEnabled) {
              const toolData = { enabled: true };
              const inputs = toolItem.querySelectorAll('.tool-input');
              inputs.forEach(input => {
                if (input.dataset.tool === toolName) {
                  toolData[input.dataset.field] = input.value;
                }
              });
              this.environmentData.tools[service.name][toolName] = toolData;
            } else {
              delete this.environmentData.tools[service.name][toolName];
            }
          });
        });
        break;
    }
  }

  addService() {
    // Save current form data before re-rendering
    if (this.currentStep === 1) {
      this.saveCurrentStepData();
    }

    const typeKeys = Object.keys(serviceTypeRegistry.types);
    if (typeKeys.length === 0) return;

    const defaultTypeKey = typeKeys[0];
    const defaultType = serviceTypeRegistry.types[defaultTypeKey];
    const defaultResources = defaultType.defaultResources || { cpu_cores: 8, ram_gb: 8, disk_size_gb: 64 };

    this.environmentData.services.push({
      name: '',
      type: defaultTypeKey,
      cpu_cores: defaultResources.cpu_cores,
      ram_gb: defaultResources.ram_gb,
      disk_size_gb: defaultResources.disk_size_gb
    });

    this.renderStep();
  }

  removeService(index) {
    // Save current form data before re-rendering
    if (this.currentStep === 1) {
      this.saveCurrentStepData();
    }

    if (index >= 0 && index < this.environmentData.services.length) {
      const service = this.environmentData.services[index];
      delete this.environmentData.tools[service.name];
      this.environmentData.services.splice(index, 1);
      this.renderStep();
    }
  }

  addNetwork() {
    // Save current form data before re-rendering
    if (this.currentStep === 2) {
      this.saveCurrentStepData();
    }

    this.environmentData.networks.push({
      name: '',
      type: 'user'
    });
    this.renderStep();
  }

  removeNetwork(index) {
    // Save current form data before re-rendering
    if (this.currentStep === 2) {
      this.saveCurrentStepData();
    }

    if (index >= 0 && index < this.environmentData.networks.length) {
      const network = this.environmentData.networks[index];
      // Remove network assignments from services
      this.environmentData.services.forEach(service => {
        if (service.network === network.name) {
          delete service.network;
        }
      });
      this.environmentData.networks.splice(index, 1);
      this.renderStep();
    }
  }

  handleConfirm() {
    this.saveCurrentStepData();

    // Final validation
    if (!this.environmentData.name.trim()) {
      alert('Environment name is required');
      return;
    }

    if (this.environmentData.services.length === 0) {
      alert('At least one service is required');
      return;
    }

    // Prepare environment config
    const config = {
      name: this.environmentData.name,
      services: this.environmentData.services,
      networks: this.environmentData.networks,
      tools: this.environmentData.tools
    };

    if (this.onConfirm) {
      this.onConfirm(config);
    }

    this.hide();
  }
}

