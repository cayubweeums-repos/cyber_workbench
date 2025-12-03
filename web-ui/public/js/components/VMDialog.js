/**
 * VM Dialog Component - Handles create/edit dialogs
 * Modular and reusable
 */
class VMDialog extends BaseComponent {
  constructor(dialogId, type = 'create') {
    const container = document.getElementById(dialogId);
    super(container);
    this.type = type;
    this.vm = null;
    this.onConfirm = null;
  }

  render() {
    // Dialog HTML is already in the page, just manage state
  }

  attachEventListeners() {
    // Use event delegation for buttons
    this.container.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action === 'cancel') {
        this.hide();
      } else if (action === 'confirm') {
        this.handleConfirm();
      }
    });

    // Slider updates
    this.setupSliders();
  }

  setupSliders() {
    const sliders = this.container.querySelectorAll('input[type="range"]');
    sliders.forEach(slider => {
      slider.addEventListener('input', (e) => {
        this.updateSliderValue(e.target);
        this.updateSliderFill(e.target);
      });
    });
  }

  updateSliderValue(slider) {
    const valueElement = slider.parentElement.querySelector('.value');
    if (valueElement) {
      const label = slider.id.includes('cpu') ? 'cores' : 'GB';
      valueElement.textContent = `${slider.value} ${label}`;
    }
  }

  updateSliderFill(slider) {
    const value = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.background = `linear-gradient(to right, var(--color-accent) 0%, var(--color-accent) ${value}%, var(--color-accent-dark) ${value}%, var(--color-accent-dark) 100%)`;
  }

  show(vm = null, onConfirm = null) {
    this.vm = vm;
    this.onConfirm = onConfirm;
    
    if (vm) {
      this.populateFields(vm);
    } else {
      this.resetFields();
    }
    
    this.container.classList.add('active');
  }

  hide() {
    this.container.classList.remove('active');
    this.vm = null;
    this.onConfirm = null;
  }

  populateFields(vm) {
    const nameField = this.container.querySelector('#edit-vm-name, #vm-name');
    const cpuField = this.container.querySelector('#edit-vm-cpu, #vm-cpu');
    const ramField = this.container.querySelector('#edit-vm-ram, #vm-ram');
    const diskField = this.container.querySelector('#edit-vm-disk, #vm-disk');

    if (nameField) nameField.value = vm.name || '';
    if (cpuField) {
      cpuField.value = vm.cpu_cores || 8;
      this.updateSliderValue(cpuField);
      this.updateSliderFill(cpuField);
    }
    if (ramField) {
      ramField.value = vm.ram_gb || 8;
      this.updateSliderValue(ramField);
      this.updateSliderFill(ramField);
    }
    if (diskField) {
      diskField.value = vm.disk_size_gb || 64;
      if (this.type === 'edit') {
        diskField.disabled = true;
      }
    }
  }

  resetFields() {
    const nameField = this.container.querySelector('#vm-name');
    const cpuField = this.container.querySelector('#vm-cpu');
    const ramField = this.container.querySelector('#vm-ram');
    const diskField = this.container.querySelector('#vm-disk');

    if (nameField) nameField.value = '';
    if (cpuField) {
      cpuField.value = 8;
      this.updateSliderValue(cpuField);
      this.updateSliderFill(cpuField);
    }
    if (ramField) {
      ramField.value = 8;
      this.updateSliderValue(ramField);
      this.updateSliderFill(ramField);
    }
    if (diskField) diskField.value = 64;
  }

  getFormData() {
    const nameField = this.container.querySelector('#edit-vm-name, #vm-name');
    const cpuField = this.container.querySelector('#edit-vm-cpu, #vm-cpu');
    const ramField = this.container.querySelector('#edit-vm-ram, #vm-ram');
    const diskField = this.container.querySelector('#edit-vm-disk, #vm-disk');

    return {
      name: nameField?.value.trim() || '',
      cpu_cores: parseInt(cpuField?.value || 8),
      ram_gb: parseInt(ramField?.value || 8),
      disk_size_gb: parseInt(diskField?.value || 64)
    };
  }

  handleConfirm() {
    const data = this.getFormData();
    
    if (!data.name) {
      alert('VM name is required');
      return;
    }

    if (data.disk_size_gb < 20) {
      alert('Disk size must be at least 20 GB');
      return;
    }

    if (this.onConfirm) {
      this.onConfirm(data, this.vm);
    }
    
    this.hide();
  }
}

