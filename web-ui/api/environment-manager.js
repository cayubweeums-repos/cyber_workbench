/**
 * Environment Manager - Handles environment YAML configuration management
 * Follows vm_manager.py pattern but in Node.js
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

class EnvironmentManager {
  constructor(repoRoot) {
    this.repoRoot = repoRoot;
    this.environmentsDir = path.join(repoRoot, 'environments');
    this.ensureEnvironmentsDir();
  }

  async ensureEnvironmentsDir() {
    try {
      await fs.mkdir(this.environmentsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create environments directory:', error);
    }
  }

  /**
   * List all environment names
   */
  async listEnvironments() {
    try {
      const files = await fs.readdir(this.environmentsDir);
      const environments = [];
      
      for (const file of files) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          const name = path.basename(file, path.extname(file));
          environments.push(name);
        }
      }
      
      return environments.sort();
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get environment configuration
   */
  async getEnvironment(name) {
    const configFile = path.join(this.environmentsDir, `${name}.yaml`);
    
    try {
      const content = await fs.readFile(configFile, 'utf8');
      const config = yaml.load(content);
      return config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create environment configuration
   */
  async createEnvironment(config) {
    const configFile = path.join(this.environmentsDir, `${config.name}.yaml`);
    
    // Check if already exists
    try {
      await fs.access(configFile);
      return false; // Already exists
    } catch (error) {
      // File doesn't exist, proceed
    }

    // Ensure createdAt is set
    if (!config.createdAt) {
      config.createdAt = new Date().toISOString();
    }

    // Ensure status is set
    if (!config.status) {
      config.status = 'stopped';
    }

    // Write YAML file
    const yamlContent = yaml.dump(config, {
      indent: 2,
      lineWidth: -1
    });

    await fs.writeFile(configFile, yamlContent, 'utf8');
    return true;
  }

  /**
   * Update environment configuration
   */
  async updateEnvironment(name, config) {
    const configFile = path.join(this.environmentsDir, `${name}.yaml`);
    
    // Check if exists
    try {
      await fs.access(configFile);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false; // Doesn't exist
      }
      throw error;
    }

    // Preserve createdAt if not provided
    const existing = await this.getEnvironment(name);
    if (existing && !config.createdAt) {
      config.createdAt = existing.createdAt;
    }

    // Write updated YAML
    const yamlContent = yaml.dump(config, {
      indent: 2,
      lineWidth: -1
    });

    await fs.writeFile(configFile, yamlContent, 'utf8');
    return true;
  }

  /**
   * Delete environment configuration
   */
  async deleteEnvironment(name) {
    const configFile = path.join(this.environmentsDir, `${name}.yaml`);
    
    try {
      await fs.unlink(configFile);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false; // Doesn't exist
      }
      throw error;
    }
  }
}

module.exports = EnvironmentManager;

