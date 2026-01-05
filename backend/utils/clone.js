const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { STORAGE_BASE, loadVmConfig, saveVmConfig, loadTemplateMetadata, saveCloneMetadata } = require('./config');
const { listContainers } = require('./docker');

const execPromise = promisify(exec);

/**
 * Generate unique clone name
 */
async function generateCloneName(templateOsType, templateVmName) {
  const containers = await listContainers({ all: true });
  let cloneNum = 1;
  let candidateName;
  
  while (true) {
    candidateName = `${templateVmName}-clone-${cloneNum}`;
    const vmId = `${templateOsType}_${candidateName}`;
    
    // Check if this name already exists
    const exists = containers.some(c => 
      c.Names.some(name => name === `/${vmId}`)
    );
    
    // Also check if directory exists
    const dirExists = fs.existsSync(path.join(STORAGE_BASE, vmId));
    
    if (!exists && !dirExists) {
      return candidateName;
    }
    
    cloneNum++;
  }
}

/**
 * Copy directory recursively using cp command
 */
async function copyDirectory(source, destination) {
  try {
    // Use cp -r for fast copy
    await execPromise(`cp -r "${source}" "${destination}"`);
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to copy directory: ${error.message}`);
  }
}

/**
 * Create clone from template
 */
async function createClone(templateContainerName, cloneName, options = {}) {
  const { ram, cpu } = options;
  
  // Parse template container name
  const parts = templateContainerName.split('_');
  const osType = parts[0];
  const templateVmName = parts.slice(1).join('_');
  
  const templateStoragePath = path.join(STORAGE_BASE, templateContainerName);
  
  // Verify source is a template
  const templateMetadata = loadTemplateMetadata(templateStoragePath);
  if (!templateMetadata || !templateMetadata.isTemplate) {
    throw new Error(`Source VM is not a template: ${templateContainerName}`);
  }
  
  // Generate clone name if not provided
  const targetCloneName = cloneName || await generateCloneName(osType, templateVmName);
  const targetVmId = `${osType}_${targetCloneName}`;
  const targetStoragePath = path.join(STORAGE_BASE, targetVmId);
  
  // Check if source exists
  if (!fs.existsSync(templateStoragePath)) {
    throw new Error(`Template VM storage not found: ${templateContainerName}`);
  }
  
  // Check if target already exists
  if (fs.existsSync(targetStoragePath)) {
    throw new Error(`Clone VM already exists: ${targetVmId}`);
  }
  
  console.log(`[Clone] Copying ${templateContainerName} to ${targetVmId}...`);
  
  // Copy entire directory
  await copyDirectory(templateStoragePath, targetStoragePath);
  console.log(`[Clone] Copy completed`);
  
  // Delete windows.mac file - will be auto-generated on container start
  const macFilePath = path.join(targetStoragePath, 'windows.mac');
  if (fs.existsSync(macFilePath)) {
    fs.unlinkSync(macFilePath);
    console.log(`[Clone] Deleted windows.mac (will be auto-generated)`);
  }
  
  // Delete template.json from clone (it's not a template)
  const templateJsonPath = path.join(targetStoragePath, 'template.json');
  if (fs.existsSync(templateJsonPath)) {
    fs.unlinkSync(templateJsonPath);
    console.log(`[Clone] Removed template.json from clone`);
  }
  
  // Load template config
  const templateConfig = loadVmConfig(templateStoragePath);
  
  // Update config with overrides (inherit username/password from template)
  const cloneConfig = {
    ram: ram || templateConfig.ram,
    cpu: cpu || templateConfig.cpu,
    username: templateConfig.username,  // Inherited, cannot change
    password: templateConfig.password,  // Inherited, cannot change
  };
  
  saveVmConfig(targetStoragePath, cloneConfig);
  console.log(`[Clone] Updated config`);
  
  // Create clone metadata (simple file-based cloning, no snapshots)
  const cloneMetadata = {
    isClone: true,
    templateSource: templateContainerName,
    createdAt: new Date().toISOString(),
  };
  
  saveCloneMetadata(targetStoragePath, cloneMetadata);
  console.log(`[Clone] Created clone metadata`);
  
  return {
    success: true,
    templateVm: templateContainerName,
    cloneVm: targetVmId,
    cloneName: targetCloneName,
    config: cloneConfig,
    metadata: cloneMetadata,
  };
}

module.exports = {
  generateCloneName,
  createClone
};

