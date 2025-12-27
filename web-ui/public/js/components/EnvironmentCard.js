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

  getHTML(progress = null) {
    const resources = this.environment.getTotalResources();
    const statusClass = this.environment.status;
    let statusText = this.environment.status.charAt(0).toUpperCase() + this.environment.status.slice(1);
    
    // Show progress if available
    if (progress && (this.environment.status === 'starting' || this.environment.status === 'stopping')) {
      statusText = `${statusText} - ${progress.stage || ''}`;
      if (progress.message) {
        statusText += `: ${progress.message}`;
      }
    }
    
    const progressHTML = progress && (this.environment.status === 'starting' || this.environment.status === 'stopping') ? `
      <div class="environment-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress.percent || 0}%"></div>
        </div>
        <div class="progress-text">${progress.percent || 0}%</div>
      </div>
    ` : '';

    const warningCount = Array.isArray(this.environment.lastStartWarnings) ? this.environment.lastStartWarnings.length : 0;
    const warningsHTML = warningCount > 0 ? `
      <div class="environment-warnings" style="margin-top: 6px; color: #ffcc66; font-size: 12px;">
        Last start warnings: ${warningCount}
      </div>
    ` : '';
    
    return `
      <div class="environment-card-header">
        <div class="environment-name">${this.environment.name}</div>
        <div class="environment-status ${statusClass}">${statusText}</div>
      </div>
      ${progressHTML}
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
        ${warningsHTML}
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

  update(environment, progress = null) {
    this.environment = environment;
    if (this.container) {
      this.container.innerHTML = this.getHTML(progress);
      this.attachEventListeners();
    }
  }

  updateProgress(progress) {
    if (this.container && (this.environment.status === 'starting' || this.environment.status === 'stopping')) {
      this.container.innerHTML = this.getHTML(progress);
      this.attachEventListeners();
    }
  }
}

