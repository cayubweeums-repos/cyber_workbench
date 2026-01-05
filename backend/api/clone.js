const fs = require('fs');
const path = require('path');
const { createClone } = require('../utils/clone');
const { STORAGE_BASE, loadCloneMetadata } = require('../utils/config');
const { startVM } = require('./vm');

/**
 * Create clone from template
 */
async function createCloneFromTemplate(req, res, buildState) {
  const { templateName } = req.params;
  const { cloneName, ram, cpu, autoStart } = req.body;
  
  try {
    console.log(`Creating clone from template: ${templateName}`);
    
    // Create the clone
    const result = await createClone(templateName, cloneName, { ram, cpu });
    
    // If autoStart is true, start the clone
    if (autoStart) {
      console.log(`Auto-starting clone: ${result.cloneVm}`);
      
      // Extract OS version and VM name from clone ID
      const parts = result.cloneVm.split('_');
      const osType = parts[0];
      const version = osType.replace('win', '');
      const vmName = parts.slice(1).join('_');
      
      // Create a fake request object for startVM
      const startReq = {
        body: {
          version,
          vmName,
          ram: result.config.ram,
          cpu: result.config.cpu,
          username: result.config.username,
          password: result.config.password,
          persistent: false,
          advancedScripts: null
        }
      };
      
      // Create a fake response object that captures the result
      let startResult = null;
      let startError = null;
      const startRes = {
        json: (data) => { startResult = data; },
        status: (code) => ({
          json: (data) => { startError = data; }
        })
      };
      
      // Call startVM
      await startVM(startReq, startRes, buildState);
      
      if (startError) {
        return res.status(500).json({
          ...result,
          started: false,
          startError: startError.error
        });
      }
      
      return res.json({
        ...result,
        started: true,
        startResult
      });
    }
    
    res.json({
      ...result,
      started: false
    });
  } catch (error) {
    console.error('Error creating clone:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * List all clones of a template
 */
async function listClonesOfTemplate(req, res) {
  const { templateName } = req.params;
  
  try {
    if (!fs.existsSync(STORAGE_BASE)) {
      return res.json([]);
    }
    
    const dirs = fs.readdirSync(STORAGE_BASE, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    const clones = [];
    
    for (const dirName of dirs) {
      const storagePath = path.join(STORAGE_BASE, dirName);
      const cloneMetadata = loadCloneMetadata(storagePath);
      
      if (cloneMetadata && cloneMetadata.templateSource === templateName) {
        clones.push({
          vmId: dirName,
          ...cloneMetadata
        });
      }
    }
    
    res.json({ success: true, clones });
  } catch (error) {
    console.error('Error listing clones:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  createCloneFromTemplate,
  listClonesOfTemplate
};

