/**
 * Environment Model - Represents an environment entity
 * Simple data model following OOP and VM.js pattern
 */
class Environment {
  constructor(data = {}) {
    this.name = data.name || '';
    this.services = data.services || []; // Array of service configs: { name, type, cpu_cores, ram_gb, disk_size_gb, network, tools[] }
    this.networks = data.networks || []; // Array of network configs: { name, type, isolated }
    this.status = data.status || 'stopped'; // 'stopped', 'running', 'starting', 'stopping'
    this.createdAt = data.createdAt || new Date().toISOString();
    // Warnings from the most recent start attempt (best-effort, informational)
    this.lastStartWarnings = Array.isArray(data.lastStartWarnings) ? data.lastStartWarnings : [];
    this.lastStartedAt = data.lastStartedAt || null;
  }

  get isRunning() {
    return this.status === 'running';
  }

  getTotalResources() {
    // Sum CPU, RAM, disk from all services
    return this.services.reduce((total, service) => ({
      cpu_cores: total.cpu_cores + (service.cpu_cores || 0),
      ram_gb: total.ram_gb + (service.ram_gb || 0),
      disk_size_gb: total.disk_size_gb + (service.disk_size_gb || 0)
    }), { cpu_cores: 0, ram_gb: 0, disk_size_gb: 0 });
  }

  getServiceCount() {
    return this.services.length;
  }

  getNetworkCount() {
    return this.networks.length;
  }

  toJSON() {
    return {
      name: this.name,
      services: this.services,
      networks: this.networks.map(net => ({
        name: net.name,
        type: net.type || 'bridge',
        isolated: net.isolated || false
      })),
      status: this.status,
      createdAt: this.createdAt,
      lastStartWarnings: this.lastStartWarnings,
      lastStartedAt: this.lastStartedAt
    };
  }
}

