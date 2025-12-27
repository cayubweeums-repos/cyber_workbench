/**
 * Service Type Registry - Registry for service types (WindowsVM, Docker, etc.)
 * Makes it easy to add new service types without code changes
 */
class ServiceTypeRegistry {
  constructor() {
    this.types = {};
    this.registerDefaults();
  }

  register(typeName, typeConfig) {
    // typeConfig: { name, icon, defaultResources: { cpu_cores, ram_gb, disk_size_gb }, supportedTools, createMethod }
    this.types[typeName] = typeConfig;
  }

  get(typeName) {
    return this.types[typeName] || null;
  }

  getAll() {
    return Object.values(this.types);
  }

  getSupportedTools(serviceType) {
    // Get tools compatible with this service type from ToolRegistry
    if (typeof ToolRegistry !== 'undefined') {
      return ToolRegistry.getToolsForServiceType(serviceType);
    }
    return [];
  }

  registerDefaults() {
    // Register WindowsVM service type
    this.register('WindowsVM', {
      name: 'Windows VM',
      icon: '',
      defaultResources: {
        cpu_cores: 8,
        ram_gb: 8,
        disk_size_gb: 64
      },
      supportedTools: ['SentinelOneAgent'], // Tool names that are compatible
      createMethod: 'vm' // Method to use for creating this service type
    });
    
    // Easy to add more service types here:
    // this.register('DockerContainer', { ... });
  }
}

// Global service type registry instance
const serviceTypeRegistry = new ServiceTypeRegistry();

