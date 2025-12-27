/**
 * VM Service - Handles all VM-related operations
 * Follows service layer pattern for easy extension
 */
class VMService {
  constructor(apiClient) {
    this.api = apiClient;
  }

  async list() {
    const response = await this.api.get('/vms');
    return response.vms || [];
  }

  async get(name) {
    const response = await this.api.get(`/vms/${name}`);
    return response.vm || null;
  }

  async create(config) {
    const response = await this.api.post('/vms', config);
    return response;
  }

  async update(name, config) {
    const response = await this.api.put(`/vms/${name}`, config);
    return response;
  }

  async delete(name) {
    const response = await this.api.delete(`/vms/${name}`);
    return response;
  }

  async getStatus(name) {
    const response = await this.api.get(`/vms/${name}/status`);
    return response.running || false;
  }

  async start(name) {
    const response = await this.api.post(`/vms/${name}/start`);
    return response;
  }

  async stop(name) {
    const response = await this.api.post(`/vms/${name}/stop`);
    return response;
  }

  async getViewerPort(name, environmentName = null) {
    const url = environmentName 
      ? `/vms/${name}/viewer-port?environment=${encodeURIComponent(environmentName)}`
      : `/vms/${name}/viewer-port`;
    const response = await this.api.get(url);
    // Response includes both port and websockifyPath for multi-VM support
    return response.port ? {
      port: response.port,
      websockifyPath: response.websockifyPath || `/websockify/${name}`
    } : null;
  }

  async getProgress(name) {
    const response = await this.api.get(`/vms/${name}/progress`);
    return response.progress || null;
  }

  async checkDesktopReady(name) {
    const response = await this.api.get(`/vms/${name}/desktop-ready`);
    return response;
  }

  async createDisk(name, diskSizeGb) {
    const response = await this.api.post(`/vms/${name}/create-disk`, { disk_size_gb: diskSizeGb });
    return response;
  }

  async downloadISO(name) {
    const response = await this.api.post(`/vms/${name}/download-iso`);
    return response;
  }

  async prepareISO(name, sudoPassword = null) {
    // Sudo password is now provided at server startup, but allow override if needed
    const body = sudoPassword ? { sudo_password: sudoPassword } : {};
    const response = await this.api.post(`/vms/${name}/prepare-iso`, body);
    return response;
  }

  /**
   * Get full VM data with status and progress
   */
  async getFullVMData(name) {
    const [config, status, progress] = await Promise.all([
      this.get(name).catch(() => null),
      this.getStatus(name).catch(() => false),
      this.getProgress(name).catch(() => null)
    ]);

    return new VM({
      ...config,
      running: status,
      progress
    });
  }

  /**
   * Get all VMs with full data
   */
  async listFull() {
    const vmNames = await this.list();
    const vms = await Promise.all(
      vmNames.map(name => this.getFullVMData(name))
    );
    return vms;
  }
}

