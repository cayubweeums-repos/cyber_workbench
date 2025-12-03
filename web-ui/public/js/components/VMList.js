/**
 * VM List Component - Manages the list of VM cards
 * Modular and easy to extend
 */
class VMList extends BaseComponent {
  constructor(containerId, vmService) {
    const container = document.getElementById(containerId);
    super(container);
    this.vmService = vmService;
    this.cards = new Map();
    this.updateInterval = null;
  }

  render() {
    if (!this.container) return;
    
    this.container.innerHTML = '<div class="vm-list"></div>';
    this.vmListElement = this.container.querySelector('.vm-list');
  }

  async load() {
    try {
      const vms = await this.vmService.listFull();
      this.display(vms);
    } catch (error) {
      console.error('Failed to load VMs:', error);
      this.showError('Failed to load VMs');
    }
  }

  display(vms) {
    if (!this.vmListElement) {
      this.render();
    }

    if (vms.length === 0) {
      this.vmListElement.innerHTML = `
        <div class="empty-state">
          <p>No VMs found. Click 'Create VM' to get started.</p>
        </div>
      `;
      return;
    }

    // Update or create cards
    vms.forEach(vm => {
      if (this.cards.has(vm.name)) {
        // Update existing card
        this.cards.get(vm.name).update(vm);
      } else {
        // Create new card
        const card = new VMCard(vm, (action, name, running) => {
          this.handleAction(action, name, running);
        });
        const cardElement = card.render();
        this.vmListElement.appendChild(cardElement);
        card.attachEventListeners();
        this.cards.set(vm.name, card);
      }
    });

    // Remove cards for VMs that no longer exist
    const currentNames = new Set(vms.map(vm => vm.name));
    for (const [name, card] of this.cards.entries()) {
      if (!currentNames.has(name)) {
        card.destroy();
        this.cards.delete(name);
      }
    }
  }

  handleAction(action, name, running) {
    // Emit event that can be handled by the main app
    const event = new CustomEvent('vm-action', {
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
    if (this.vmListElement) {
      this.vmListElement.innerHTML = `
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

