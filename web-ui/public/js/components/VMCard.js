/**
 * VM Card Component - Displays a single VM card
 * Modular and reusable
 */
class VMCard extends BaseComponent {
  constructor(vm, onAction) {
    super(null);
    this.vm = vm;
    this.onAction = onAction || (() => {});
  }

  render() {
    const card = document.createElement('div');
    card.className = 'vm-card';
    card.innerHTML = this.getHTML();
    this.container = card;
    return card;
  }

  getHTML() {
    const progressHTML = this.vm.isProcessing() ? this.getProgressHTML() : '';
    
    return `
      <div class="vm-card-header">
        <div class="vm-name">${this.vm.name}</div>
        <div class="vm-status ${this.vm.status}">${this.vm.statusText}</div>
      </div>
      ${progressHTML}
      <div class="vm-specs">
        <span>CPU: ${this.vm.cpu_cores} cores</span>
        <span>RAM: ${this.vm.ram_gb} GB</span>
        <span>Disk: ${this.vm.disk_size_gb} GB</span>
      </div>
      <div class="vm-actions">
        <button class="btn ${this.vm.running ? 'btn-danger' : ''}" 
                data-action="toggle" 
                ${this.vm.isProcessing() ? 'disabled' : ''}>
          ${this.vm.running ? 'Stop' : 'Start'}
        </button>
        <button class="btn btn-secondary" data-action="view">View</button>
        <button class="btn btn-secondary" 
                data-action="edit" 
                ${this.vm.isProcessing() ? 'disabled' : ''}>Edit</button>
        <button class="btn btn-danger" 
                data-action="delete" 
                ${this.vm.isProcessing() ? 'disabled' : ''}>Delete</button>
      </div>
    `;
  }

  getProgressHTML() {
    const progress = this.vm.progress;
    const percent = progress.percent || 0;
    
    return `
      <div class="vm-progress">
        <div class="vm-progress-bar">
          <div class="vm-progress-fill" style="width: ${percent}%"></div>
        </div>
        <div class="vm-progress-info">
          <span class="vm-progress-message">${progress.message || ''}</span>
          ${progress.details ? `<span class="vm-progress-details">${progress.details}</span>` : ''}
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    if (!this.container) return;
    
    const buttons = this.container.querySelectorAll('[data-action]');
    buttons.forEach(button => {
      button.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        this.onAction(action, this.vm.name, this.vm.running);
      });
    });
  }

  update(vm) {
    this.vm = vm;
    if (this.container) {
      this.container.innerHTML = this.getHTML();
      this.attachEventListeners();
    }
  }
}

