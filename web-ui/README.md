# VM Manager Web UI - Architecture

## Overview

This web UI follows Object-Oriented Programming (OOP), KISS principles, and modular design to make it easy to extend and integrate new features.

## Architecture

### Directory Structure

```
web-ui/
├── api/                    # Backend API (Node.js/Express)
│   ├── routes.js          # Route definitions
│   ├── vm.js              # VM API endpoints
│   ├── operations.js      # VM operations wrapper
│   ├── python-bridge.js   # Python subprocess bridge
│   └── progress.js        # Progress tracking
├── public/
│   ├── js/
│   │   ├── core/          # Core utilities
│   │   │   └── APIClient.js
│   │   ├── models/        # Data models
│   │   │   └── VM.js
│   │   ├── services/      # Service layer
│   │   │   ├── VMService.js
│   │   │   └── ServiceRegistry.js
│   │   ├── components/    # UI components
│   │   │   ├── BaseComponent.js
│   │   │   ├── VMCard.js
│   │   │   ├── VMList.js
│   │   │   └── VMDialog.js
│   │   ├── viewer.js      # VM viewer component
│   │   └── app.js         # Main application
│   └── ...
└── server.js              # Express server
```

## Design Principles

### 1. Object-Oriented Programming
- **Classes**: All major functionality is encapsulated in classes
- **Inheritance**: Components extend `BaseComponent` for common functionality
- **Encapsulation**: Each class manages its own state and behavior

### 2. KISS (Keep It Simple, Stupid)
- Simple, focused classes with single responsibilities
- Clear method names and straightforward logic
- Minimal dependencies between components

### 3. Modularity
- **Separation of Concerns**: Models, Services, Components are separate
- **Service Layer**: Business logic separated from UI
- **Component-Based**: UI broken into reusable components

### 4. Extensibility

#### Adding a New Service (e.g., Environments)

1. **Create Service Class**:
```javascript
// js/services/EnvironmentService.js
class EnvironmentService {
  constructor(apiClient) {
    this.api = apiClient;
  }
  
  async list() {
    return this.api.get('/environments');
  }
  
  async deploy(config) {
    return this.api.post('/environments', config);
  }
}
```

2. **Register in ServiceRegistry**:
```javascript
// js/services/ServiceRegistry.js
initializeServices() {
  this.services.vm = new VMService(this.apiClient);
  this.services.environment = new EnvironmentService(this.apiClient); // Add here
}
```

3. **Create Component**:
```javascript
// js/components/EnvironmentList.js
class EnvironmentList extends BaseComponent {
  constructor(containerId, environmentService) {
    super(containerId);
    this.environmentService = environmentService;
  }
  // ... implement component
}
```

4. **Add to Main App**:
```javascript
// js/app.js
this.environmentService = this.services.get('environment');
this.environmentList = new EnvironmentList('env-list-container', this.environmentService);
```

#### Adding a New Model

1. Create model class in `js/models/`
2. Use in services and components
3. Follow the same pattern as `VM.js`

#### Adding a New Component

1. Extend `BaseComponent`
2. Implement `render()` and `attachEventListeners()`
3. Use in main app or other components

## Key Classes

### APIClient
- Handles all HTTP communication
- Provides `get()`, `post()`, `put()`, `delete()` methods
- Centralized error handling

### ServiceRegistry
- Central registry for all services
- Easy to add new services
- Provides `get(serviceName)` method

### BaseComponent
- Base class for all UI components
- Provides lifecycle methods: `init()`, `render()`, `update()`, `destroy()`
- Ensures consistent component behavior

### VMService
- Handles all VM-related API calls
- Provides high-level methods: `list()`, `create()`, `start()`, etc.
- Returns `VM` model instances

## Example: Adding Environment Feature

```javascript
// 1. Create EnvironmentService
class EnvironmentService {
  constructor(apiClient) {
    this.api = apiClient;
  }
  
  async deploy(config) {
    return this.api.post('/environments', config);
  }
}

// 2. Register in ServiceRegistry
services.register('environment', new EnvironmentService(services.apiClient));

// 3. Create EnvironmentList component
class EnvironmentList extends BaseComponent {
  constructor(containerId, environmentService) {
    super(containerId);
    this.environmentService = environmentService;
  }
  
  async load() {
    const environments = await this.environmentService.list();
    this.display(environments);
  }
}

// 4. Use in main app
this.environmentService = services.get('environment');
this.environmentList = new EnvironmentList('env-container', this.environmentService);
this.environmentList.init();
```

## Benefits

1. **Easy to Test**: Each class can be tested independently
2. **Easy to Extend**: Add new services/components without modifying existing code
3. **Easy to Maintain**: Clear structure makes it easy to find and fix issues
4. **Reusable**: Components and services can be reused across features
5. **Scalable**: Architecture supports growth without becoming complex

