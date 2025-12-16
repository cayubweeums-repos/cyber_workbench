/**
 * Environment Service - Handles all environment-related operations
 * Follows service layer pattern for easy extension
 */
class EnvironmentService {
  constructor(apiClient) {
    this.api = apiClient;
  }

  async list() {
    const response = await this.api.get('/environments');
    return response.environments || [];
  }

  async get(name) {
    const response = await this.api.get(`/environments/${name}`);
    return response.environment || null;
  }

  async create(config) {
    const response = await this.api.post('/environments', config);
    return response;
  }

  async update(name, config) {
    const response = await this.api.put(`/environments/${name}`, config);
    return response;
  }

  async delete(name) {
    const response = await this.api.delete(`/environments/${name}`);
    return response;
  }

  async getStatus(name) {
    const response = await this.api.get(`/environments/${name}`);
    if (response.environment) {
      return response.environment.status || 'stopped';
    }
    return 'stopped';
  }

  async start(name) {
    const response = await this.api.post(`/environments/${name}/start`);
    return response;
  }

  async stop(name) {
    const response = await this.api.post(`/environments/${name}/stop`);
    return response;
  }

  /**
   * Get full environment data with status
   */
  async getFullEnvironmentData(name) {
    const env = await this.get(name);
    if (!env) {
      return null;
    }
    return new Environment(env);
  }

  /**
   * Get all environments with full data
   */
  async listFull() {
    const envNames = await this.list();
    const environments = await Promise.all(
      envNames.map(name => this.getFullEnvironmentData(name))
    );
    return environments.filter(env => env !== null);
  }
}

