/**
 * Base Component - Base class for all UI components
 * Follows OOP and provides common functionality
 */
class BaseComponent {
  constructor(container) {
    this.container = container;
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;
    this.render();
    this.attachEventListeners();
    this.isInitialized = true;
  }

  render() {
    // Override in subclasses
  }

  attachEventListeners() {
    // Override in subclasses
  }

  update() {
    this.render();
  }

  destroy() {
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.isInitialized = false;
  }
}

