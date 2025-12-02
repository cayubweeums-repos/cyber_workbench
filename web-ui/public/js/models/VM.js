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
    // Not processing if VM is running
    if (this.running) {
      return false;
    }
    
    // Not processing if no progress
    if (!this.progress) {
      return false;
    }
    
    // Not processing if progress indicates completion (Ready, 100%, or success)
    if (this.progress.stage === 'Ready' || 
        this.progress.stage === 'Error' ||
        this.progress.percent === 100 ||
        (this.progress.message && this.progress.message.toLowerCase().includes('ready'))) {
      return false;
    }
    
    // Otherwise, we're processing
    return true;
  }
}

