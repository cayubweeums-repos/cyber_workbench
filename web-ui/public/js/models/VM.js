/**
 * VM Model - Represents a VM entity
 * Simple data model following OOP
 */
class VM {
  constructor(data = {}) {
    this.name = data.name || '';
    this.cpu_cores = data.cpu_cores || 0;
    this.ram_gb = data.ram_gb || 0;
    this.disk_size_gb = data.disk_size_gb || 0;
    this.network = data.network || 'user';
    this.created = data.created || null;
    this.running = data.running || false;
    this.progress = data.progress || null;
  }

  get status() {
    if (this.progress && !this.running) {
      return 'processing';
    }
    return this.running ? 'running' : 'stopped';
  }

  get statusText() {
    if (this.progress && !this.running) {
      return this.progress.stage || 'Processing...';
    }
    return this.running ? 'Running' : 'Stopped';
  }

  isProcessing() {
    return this.progress !== null && !this.running;
  }
}

