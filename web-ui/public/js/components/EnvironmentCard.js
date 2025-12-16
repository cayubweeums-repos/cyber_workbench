/**
 * Environment Card Component - Displays a single environment card
 * Modular and reusable, following VMCard pattern
 */
class EnvironmentCard extends BaseComponent {
  constructor(environment, onAction) {
    super(null);
    this.environment = environment;
    this.onAction = onAction || (() => {});
  }

  render() {
    const card = document.createElement('div');
    card.className = 'environment-card';
    card.innerHTML = this.getHTML();
    this.container = card;
    return card;
  }

  getHTML() {
    const resources = this.environment.getTotalResources();
    const statusClass = this.environment.status;
    const statusText = this.environment.status.charAt(0).toUpperCase() + this.environment.status.slice(1);
    
    return `
      <div class="environment-card-header">
        <div class="environment-name">${this.environment.name}</div>
        <div class="environment-status ${statusClass}">${statusText}</div>
      </div>
      <div class="environment-info">
        <div class="environment-specs">
          <span>Services: ${this.environment.getServiceCount()}</span>
          <span>Networks: ${this.environment.getNetworkCount()}</span>
        </div>
        <div class="environment-resources">
          <span>CPU: ${resources.cpu_cores} cores</span>
          <span>RAM: ${resources.ram_gb} GB</span>
          <span>Disk: ${resources.disk_size_gb} GB</span>
        </div>
      </div>
      <div class="environment-actions">
        <button class="btn ${this.environment.isRunning ? 'btn-danger' : ''}" 
                data-action="toggle" 
                ${this.environment.status === 'starting' || this.environment.status === 'stopping' ? 'disabled' : ''}>
          ${this.environment.isRunning ? 'Stop' : 'Start'}
        </button>
        <button class="btn btn-secondary" data-action="view">View</button>
        <button class="btn btn-danger" 
                data-action="delete" 
                ${this.environment.status === 'starting' || this.environment.status === 'stopping' ? 'disabled' : ''}>Delete</button>
      </div>
    `;
  }

  attachEventListeners() {
    if (!this.container) return;
    
    const buttons = this.container.querySelectorAll('[data-action]');
    buttons.forEach(button => {
      button.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        this.onAction(action, this.environment.name, this.environment.isRunning);
      });
    });
  }

  update(environment) {
    this.environment = environment;
    if (this.container) {
      this.container.innerHTML = this.getHTML();
      this.attachEventListeners();
    }
  }
}

