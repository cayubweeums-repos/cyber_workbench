/**
 * Navigation Sidebar Component - Handles navigation between Environments and VMs views
 * Follows OOP and extends BaseComponent
 */
class NavigationSidebar extends BaseComponent {
  constructor(containerId) {
    const container = document.getElementById(containerId);
    super(container);
    this.activeView = 'environments'; // Default view
  }

  render() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <nav class="nav-sidebar">
        <div class="nav-item active" data-view="environments">
          <span class="nav-icon">🌐</span>
          <span class="nav-label">Environments</span>
        </div>
        <div class="nav-item" data-view="vms">
          <span class="nav-icon">💻</span>
          <span class="nav-label">VMs</span>
        </div>
      </nav>
    `;
  }

  attachEventListeners() {
    if (!this.container) return;
    
    const navItems = this.container.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        this.setActiveView(view);
        
        // Emit custom event for app to handle
        const event = new CustomEvent('nav-change', {
          detail: { view }
        });
        document.dispatchEvent(event);
      });
    });
  }

  setActiveView(view) {
    this.activeView = view;
    
    // Update visual state
    const navItems = this.container.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      if (item.dataset.view === view) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  getActiveView() {
    return this.activeView;
  }
}

