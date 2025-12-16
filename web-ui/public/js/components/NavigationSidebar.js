/**
 * Navigation Sidebar Component - Handles navigation between Environments and VMs views
 * Follows OOP and extends BaseComponent
 */
class NavigationSidebar extends BaseComponent {
  constructor(containerId) {
    const container = document.getElementById(containerId);
    super(container);
    this.activeView = 'environments'; // Default view
    this.isExpanded = true; // Default to expanded
  }

  render() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <nav class="nav-sidebar ${this.isExpanded ? 'expanded' : 'collapsed'}">
        <button class="nav-toggle" id="nav-toggle-btn" title="${this.isExpanded ? 'Collapse' : 'Expand'}">
          <span class="nav-toggle-icon">${this.isExpanded ? '◀' : '▶'}</span>
        </button>
        <div class="nav-item active" data-view="environments" title="Environments">
          <span class="nav-label">Environments</span>
        </div>
        <div class="nav-item" data-view="vms" title="VMs">
          <span class="nav-label">VMs</span>
        </div>
      </nav>
    `;
  }

  attachEventListeners() {
    if (!this.container) return;
    
    // Toggle button
    const toggleBtn = this.container.querySelector('#nav-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle();
      });
    }
    
    // Nav items
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

  toggle() {
    this.isExpanded = !this.isExpanded;
    this.updateExpandedState();
  }

  updateExpandedState() {
    const sidebar = this.container.querySelector('.nav-sidebar');
    const toggleBtn = this.container.querySelector('#nav-toggle-btn');
    const toggleIcon = this.container.querySelector('.nav-toggle-icon');
    
    if (sidebar) {
      if (this.isExpanded) {
        sidebar.classList.remove('collapsed');
        sidebar.classList.add('expanded');
        this.container.classList.remove('collapsed');
      } else {
        sidebar.classList.remove('expanded');
        sidebar.classList.add('collapsed');
        this.container.classList.add('collapsed');
      }
    }
    
    if (toggleBtn) {
      toggleBtn.title = this.isExpanded ? 'Collapse' : 'Expand';
    }
    
    if (toggleIcon) {
      toggleIcon.textContent = this.isExpanded ? '<' : '>';
    }
    
    // Update main content margin
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      if (this.isExpanded) {
        mainContent.style.marginLeft = '200px';
      } else {
        mainContent.style.marginLeft = '60px';
      }
    }
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

