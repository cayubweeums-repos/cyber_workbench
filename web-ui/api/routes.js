/**
 * API Routes Setup
 */

const express = require('express');
const vmRoutes = require('./vm');
const operations = require('./operations');

function setupRoutes(app) {
  const router = express.Router();
  
  // VM management routes
  router.get('/vms', vmRoutes.listVMs);
  router.get('/vms/:name', vmRoutes.getVMConfig);
  router.post('/vms', vmRoutes.createVM);
  router.put('/vms/:name', vmRoutes.editVM);
  router.delete('/vms/:name', vmRoutes.deleteVM);
  router.get('/vms/:name/status', vmRoutes.getVMStatus);
  router.post('/vms/:name/start', vmRoutes.startVM);
  router.post('/vms/:name/stop', vmRoutes.stopVM);
  router.get('/vms/:name/viewer-port', vmRoutes.getViewerPort);
  
  // VM creation workflow endpoints
  router.post('/vms/:name/create-disk', async (req, res) => {
    try {
      const { name } = req.params;
      const { disk_size_gb } = req.body;
      await operations.createVMDisk(name, disk_size_gb);
      res.json({ success: true, message: 'Disk created' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  router.post('/download-iso', async (req, res) => {
    try {
      await operations.downloadWindowsISO();
      res.json({ success: true, message: 'ISO downloaded' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  router.post('/vms/:name/prepare-iso', async (req, res) => {
    try {
      const { name } = req.params;
      
      // Set up WebSocket or polling for progress updates
      // For now, use simple response
      await operations.prepareISOForVM(name, (message) => {
        // Progress updates could be sent via WebSocket here
        console.log(`Progress: ${message}`);
      });
      
      res.json({ success: true, message: 'ISO prepared' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  app.use('/api', router);
}

module.exports = { setupRoutes };

