/**
 * Service Registry - Central registry for all services
 * Makes it easy to add new services (environments, etc.)
 */
class ServiceRegistry {
  constructor() {
    this.apiClient = new APIClient();
    this.services = {};
    this.initializeServices();
  }

  initializeServices() {
    // Register VM service
    this.services.vm = new VMService(this.apiClient);
    
    // Register Environment service
    this.services.environment = new EnvironmentService(this.apiClient);
    
    // Easy to add more services here:
    // this.services.network = new NetworkService(this.apiClient);
  }

  get(serviceName) {
    return this.services[serviceName];
  }

  register(serviceName, serviceInstance) {
    this.services[serviceName] = serviceInstance;
  }
}

// Global service registry instance
const services = new ServiceRegistry();

