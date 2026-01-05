const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { getContainer, docker } = require('./docker');
const { STORAGE_BASE, loadTemplateMetadata, saveTemplateMetadata } = require('./config');
const { formatVolumeBind } = require('./volume');

const execAsync = promisify(exec);

/**
 * Call QMP API inside Windows container
 */
async function callQmpApi(containerName, endpoint, method = 'GET', body = null) {
  try {
    const container = getContainer(containerName);
    
    let curlCmd = `curl -s -X ${method} http://localhost:8007/api/qmp/${endpoint}`;
    
    if (body) {
      curlCmd += ` -H "Content-Type: application/json" -d '${JSON.stringify(body)}'`;
    }
    
    const exec = await container.exec({
      Cmd: ['sh', '-c', curlCmd],
      AttachStdout: true,
      AttachStderr: true,
    });
    
    const stream = await exec.start({ Detach: false });
    
    const stdout = [];
    const stderr = [];
    
    await new Promise((resolve, reject) => {
      const docker = require('./docker').docker;
      docker.modem.demuxStream(stream,
        { write: (chunk) => stdout.push(chunk) },
        { write: (chunk) => stderr.push(chunk) }
      );
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    
    const output = Buffer.concat(stdout).toString().trim();
    const error = Buffer.concat(stderr).toString().trim();
    
    if (error) {
      console.error('QMP API error:', error);
    }
    
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`QMP API call failed: ${error.message}`);
  }
}


/**
 * Mark VM as template (simple file-based approach)
 */
async function markAsTemplate(containerName) {
  try {
    const parts = containerName.split('_');
    const osType = parts[0];
    const vmName = parts.slice(1).join('_');
    
    const storagePath = path.join(STORAGE_BASE, containerName);
    
    if (!fs.existsSync(storagePath)) {
      throw new Error(`VM storage not found: ${containerName}`);
    }
    
    // Check if already a template
    if (loadTemplateMetadata(storagePath)) {
      throw new Error('VM is already marked as a template');
    }
    
    // Check if container is running and stop it
    try {
      const container = getContainer(containerName);
      const info = await container.inspect();
      
      if (info.State.Running) {
        console.log(`Stopping container ${containerName}...`);
        await container.stop();
        console.log(`Container ${containerName} stopped`);
      }
    } catch (err) {
      // Container doesn't exist or already stopped, that's fine
      console.log(`Container ${containerName} is not running`);
    }
    
    // Create template metadata
    const metadata = {
      isTemplate: true,
      createdAt: new Date().toISOString(),
      sourceVmName: vmName,
      osType: osType
    };
    
    saveTemplateMetadata(storagePath, metadata);
    console.log(`Template metadata saved for ${containerName}`);
    
    return {
      success: true,
      containerName,
      metadata
    };
  } catch (error) {
    throw new Error(`Failed to mark as template: ${error.message}`);
  }
}

/**
 * Unmark template (remove template status)
 */
async function unmarkAsTemplate(containerName) {
  try {
    const storagePath = path.join(STORAGE_BASE, containerName);
    
    if (!fs.existsSync(storagePath)) {
      throw new Error(`VM storage not found: ${containerName}`);
    }
    
    const metadata = loadTemplateMetadata(storagePath);
    if (!metadata) {
      throw new Error('VM is not marked as a template');
    }
    
    // Delete template.json
    const metadataPath = path.join(storagePath, 'template.json');
    fs.unlinkSync(metadataPath);
    
    console.log(`Template status removed for ${containerName}`);
    
    return {
      success: true,
      containerName
    };
  } catch (error) {
    throw new Error(`Failed to unmark template: ${error.message}`);
  }
}

/**
 * Check if VM is a template
 */
function isTemplate(containerName) {
  const storagePath = path.join(STORAGE_BASE, containerName);
  return loadTemplateMetadata(storagePath) !== null;
}

/**
 * Get template info
 */
function getTemplateInfo(containerName) {
  const storagePath = path.join(STORAGE_BASE, containerName);
  return loadTemplateMetadata(storagePath);
}

module.exports = {
  markAsTemplate,
  unmarkAsTemplate,
  isTemplate,
  getTemplateInfo,
  callQmpApi
};

