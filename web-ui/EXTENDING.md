# Extending the VM Manager

This document shows how to extend the VM Manager with new features, following the OOP, KISS, and modular design principles.

## Quick Start: Adding an Environment Feature

### Step 1: Create the Environment Model

```javascript
// public/js/models/Environment.js
class Environment {
  constructor(data = {}) {
    this.name = data.name || '';
    this.vms = data.vms || [];
    this.services = data.services || [];
    this.status = data.status || 'stopped';
  }

  get isRunning() {
    return this.status === 'running';
  }
}
```

### Step 2: Create the Environment Service

```javascript
// public/js/services/EnvironmentService.js
class EnvironmentService {
  constructor(apiClient) {
    this.api = apiClient;
  }

  async list() {
    const response = await this.api.get('/environments');
    return (response.environments || []).map(env => new Environment(env));
  }

  async get(name) {
    const response = await this.api.get(`/environments/${name}`);
    return new Environment(response.environment);
  }

  async deploy(config) {
    const response = await this.api.post('/environments', config);
    return response;
  }

  async start(name) {
    return this.api.post(`/environments/${name}/start`);
  }

  async stop(name) {
    return this.api.post(`/environments/${name}/stop`);
  }
}
```

### Step 3: Register the Service

```javascript
// public/js/services/ServiceRegistry.js
initializeServices() {
  this.services.vm = new VMService(this.apiClient);
  this.services.environment = new EnvironmentService(this.apiClient); // Add this
}
```

### Step 4: Create Environment Components

```javascript
// public/js/components/EnvironmentCard.js
class EnvironmentCard extends BaseComponent {
  constructor(environment, onAction) {
    super(null);
    this.environment = environment;
    this.onAction = onAction || (() => {});
  }

  render() {
    const card = document.createElement('div');
    card.className = 'environment-card';
    card.innerHTML = `
      <div class="environment-header">
        <h3>${this.environment.name}</h3>
        <span class="status ${this.environment.status}">${this.environment.status}</span>
      </div>
      <div class="environment-vms">
        VMs: ${this.environment.vms.length}
      </div>
      <div class="environment-actions">
        <button data-action="start">Start</button>
        <button data-action="stop">Stop</button>
        <button data-action="view">View</button>
      </div>
    `;
    this.container = card;
    this.attachEventListeners();
    return card;
  }

  attachEventListeners() {
    this.container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.onAction(e.target.dataset.action, this.environment.name);
      });
    });
  }
}
```

### Step 5: Create Environment List Component

```javascript
// public/js/components/EnvironmentList.js
class EnvironmentList extends BaseComponent {
  constructor(containerId, environmentService) {
    const container = document.getElementById(containerId);
    super(container);
    this.environmentService = environmentService;
    this.cards = new Map();
  }

  async load() {
    try {
      const environments = await this.environmentService.list();
      this.display(environments);
    } catch (error) {
      console.error('Failed to load environments:', error);
    }
  }

  display(environments) {
    if (!this.container) return;
    
    this.container.innerHTML = '<div class="environment-list"></div>';
    const list = this.container.querySelector('.environment-list');
    
    environments.forEach(env => {
      const card = new EnvironmentCard(env, (action, name) => {
        this.handleAction(action, name);
      });
      list.appendChild(card.render());
      this.cards.set(env.name, card);
    });
  }

  handleAction(action, name) {
    const event = new CustomEvent('environment-action', {
      detail: { action, name }
    });
    document.dispatchEvent(event);
  }
}
```

### Step 6: Integrate into Main App

```javascript
// public/js/app.js
class VMManagerApp {
  constructor() {
    this.services = services;
    this.vmService = this.services.get('vm');
    this.environmentService = this.services.get('environment'); // Add this
    // ... other services
  }

  initializeComponents() {
    // ... existing components
    
    // Add environment list
    this.environmentList = new EnvironmentList('environment-list-container', this.environmentService);
    this.environmentList.init();
    
    // Listen for environment actions
    document.addEventListener('environment-action', (e) => {
      this.handleEnvironmentAction(e.detail.action, e.detail.name);
    });
  }

  async handleEnvironmentAction(action, name) {
    switch (action) {
      case 'start':
        await this.environmentService.start(name);
        await this.environmentList.load();
        break;
      case 'stop':
        await this.environmentService.stop(name);
        await this.environmentList.load();
        break;
      // ... other actions
    }
  }
}
```

### Step 7: Add Backend API Routes

```javascript
// api/routes.js
router.get('/environments', environmentRoutes.list);
router.post('/environments', environmentRoutes.create);
router.post('/environments/:name/start', environmentRoutes.start);
router.post('/environments/:name/stop', environmentRoutes.stop);
```

## Architecture Benefits

1. **Modular**: Each feature is self-contained
2. **Reusable**: Components and services can be reused
3. **Testable**: Each class can be tested independently
4. **Extensible**: Add new features without modifying existing code
5. **Maintainable**: Clear structure makes it easy to understand and modify

## Design Patterns Used

- **Service Layer**: Business logic separated from UI
- **Component Pattern**: UI broken into reusable components
- **Registry Pattern**: Central service registry
- **Observer Pattern**: Custom events for component communication
- **Template Method**: BaseComponent provides structure

## Best Practices

1. **Single Responsibility**: Each class does one thing well
2. **Dependency Injection**: Services injected via constructor
3. **Event-Driven**: Components communicate via events
4. **Async/Await**: All async operations use promises
5. **Error Handling**: Errors handled at appropriate levels

