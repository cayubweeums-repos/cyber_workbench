const fs = require('fs');
const path = require('path');

const STORAGE_BASE = process.env.STORAGE_BASE || '/app/storage/vms';

/**
 * Get VM storage path
 */
function getVmStoragePath(osType, vmName) {
  return path.join(STORAGE_BASE, `${osType}_${vmName}`);
}

/**
 * Load VM configuration from config.txt
 */
function loadVmConfig(storagePath) {
  const configPath = path.join(storagePath, 'config.txt');
  
  if (!fs.existsSync(configPath)) {
    return {
      ram: '8G',
      cpu: '4',
      username: 'user',
      password: 'password'
    };
  }
  
  const content = fs.readFileSync(configPath, 'utf8');
  const config = {};
  
  content.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      if (key === 'RAM_SIZE') config.ram = value;
      if (key === 'CPU_CORES') config.cpu = value;
      if (key === 'USERNAME') config.username = value;
      if (key === 'PASSWORD') config.password = value;
    }
  });
  
  return {
    ram: config.ram || '8G',
    cpu: config.cpu || '4',
    username: config.username || 'user',
    password: config.password || 'password'
  };
}

/**
 * Save VM configuration to config.txt
 */
function saveVmConfig(storagePath, config) {
  const configPath = path.join(storagePath, 'config.txt');
  const configContent = `RAM_SIZE=${config.ram}\nCPU_CORES=${config.cpu}\nUSERNAME=${config.username}\nPASSWORD=${config.password}\n`;
  
  fs.mkdirSync(storagePath, { recursive: true });
  fs.writeFileSync(configPath, configContent);
}

/**
 * Load template metadata from template.json
 */
function loadTemplateMetadata(storagePath) {
  const metadataPath = path.join(storagePath, 'template.json');
  
  if (!fs.existsSync(metadataPath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(metadataPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading template metadata:', error.message);
    return null;
  }
}

/**
 * Save template metadata to template.json
 */
function saveTemplateMetadata(storagePath, metadata) {
  const metadataPath = path.join(storagePath, 'template.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}

/**
 * Load clone metadata from clone.json
 */
function loadCloneMetadata(storagePath) {
  const metadataPath = path.join(storagePath, 'clone.json');
  
  if (!fs.existsSync(metadataPath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(metadataPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading clone metadata:', error.message);
    return null;
  }
}

/**
 * Save clone metadata to clone.json
 */
function saveCloneMetadata(storagePath, metadata) {
  const metadataPath = path.join(storagePath, 'clone.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}

module.exports = {
  STORAGE_BASE,
  getVmStoragePath,
  loadVmConfig,
  saveVmConfig,
  loadTemplateMetadata,
  saveTemplateMetadata,
  loadCloneMetadata,
  saveCloneMetadata
};

