/**
 * Environment List Component - Manages the list of environment cards
 * Modular and easy to extend, following VMList pattern
 */
class EnvironmentList extends BaseComponent {
  constructor(containerId, environmentService) {
    const container = document.getElementById(containerId);
    super(container);
    this.environmentService = environmentService;
    this.cards = new Map();
    this.updateInterval = null;
  }

  render() {
    if (!this.container) return;
    
    this.container.innerHTML = '<div class="environment-list"></div>';
    this.environmentListElement = this.container.querySelector('.environment-list');
  }

  async load() {
    try {
      const environments = await this.environmentService.listFull();
      this.display(environments);
    } catch (error) {
      console.error('Failed to load environments:', error);
      this.showError('Failed to load environments');
    }
  }

  display(environments) {
    if (!this.environmentListElement) {
      this.render();
    }

    if (environments.length === 0) {
      this.environmentListElement.innerHTML = `
        <div class="empty-state">
          <p>No environments found. Click 'Create Environment' to get started.</p>
        </div>
      `;
      return;
    }

    // Update or create cards
    environments.forEach(environment => {
      if (this.cards.has(environment.name)) {
        // Update existing card
        this.cards.get(environment.name).update(environment);
      } else {
        // Create new card
        const card = new EnvironmentCard(environment, (action, name, running) => {
          this.handleAction(action, name, running);
        });
        const cardElement = card.render();
        this.environmentListElement.appendChild(cardElement);
        card.attachEventListeners();
        this.cards.set(environment.name, card);
      }
    });

    // Remove cards for environments that no longer exist
    const currentNames = new Set(environments.map(env => env.name));
    for (const [name, card] of this.cards.entries()) {
      if (!currentNames.has(name)) {
        card.destroy();
        this.cards.delete(name);
      }
    }
  }

  handleAction(action, name, running) {
    // Emit event that can be handled by the main app
    const event = new CustomEvent('environment-action', {
      detail: { action, name, running }
    });
    document.dispatchEvent(event);
  }

  startAutoUpdate(interval = 2000) {
    this.stopAutoUpdate();
    this.updateInterval = setInterval(() => {
      this.load();
    }, interval);
  }

  stopAutoUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  showError(message) {
    if (this.environmentListElement) {
      this.environmentListElement.innerHTML = `
        <div class="empty-state">
          <p style="color: #ff4444;">${message}</p>
        </div>
      `;
    }
  }

  destroy() {
    this.stopAutoUpdate();
    this.cards.forEach(card => card.destroy());
    this.cards.clear();
    super.destroy();
  }
}

