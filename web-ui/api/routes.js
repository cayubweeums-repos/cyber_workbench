/**
 * API Routes Setup
 */

const express = require('express');
const vmRoutes = require('./vm');
const operations = require('./operations');
const { getProgress } = require('./progress');

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
      
      // Start async disk creation
      operations.createVMDisk(name, disk_size_gb).catch(err => {
        console.error('Disk creation error:', err);
      });
      
      res.json({ success: true, message: 'Disk creation started' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  router.post('/vms/:name/download-iso', async (req, res) => {
    try {
      const { name } = req.params;
      
      // Start async download
      operations.downloadWindowsISO(name).catch(err => {
        console.error('ISO download error:', err);
      });
      
      res.json({ success: true, message: 'ISO download started' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  router.post('/vms/:name/prepare-iso', async (req, res) => {
    try {
      const { name } = req.params;
      
      // Start async preparation
      operations.prepareISOForVM(name).catch(err => {
        console.error('ISO preparation error:', err);
      });
      
      res.json({ success: true, message: 'ISO preparation started' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // Progress endpoint
  router.get('/vms/:name/progress', (req, res) => {
    const { name } = req.params;
    const progress = getProgress(name);
    res.json({ success: true, progress });
  });
  
  app.use('/api', router);
}

module.exports = { setupRoutes };

