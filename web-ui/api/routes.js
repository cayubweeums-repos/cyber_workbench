/**
 * API Routes Setup
 */

const express = require('express');
const vmRoutes = require('./vm');
const environmentRoutes = require('./environment');
const operations = require('./operations');
const { getProgress } = require('./progress');
const docsRoutes = require('./docs');

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
  router.get('/vms/:name/desktop-ready', vmRoutes.checkDesktopReady);
  
  // VM creation workflow endpoints
  router.post('/vms/:name/create-disk', async (req, res) => {
    try {
      const { name } = req.params;
      const { disk_size_gb } = req.body;
      
      // Wait for disk creation to complete
      await operations.createVMDisk(name, disk_size_gb);
      
      res.json({ success: true, message: 'Disk creation completed' });
    } catch (error) {
      console.error('Disk creation error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  router.post('/vms/:name/download-iso', async (req, res) => {
    try {
      const { name } = req.params;
      
      // Wait for download to complete
      await operations.downloadWindowsISO(name);
      
      res.json({ success: true, message: 'ISO download completed' });
    } catch (error) {
      console.error('ISO download error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  router.post('/vms/:name/prepare-iso', async (req, res) => {
    try {
      const { name } = req.params;
      // Sudo password is now provided at startup, but allow override via request body
      const { sudo_password } = req.body;
      
      // Wait for preparation to complete
      await operations.prepareISOForVM(name, sudo_password);
      
      res.json({ success: true, message: 'ISO preparation completed' });
    } catch (error) {
      console.error('ISO preparation error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // Progress endpoint
  router.get('/vms/:name/progress', (req, res) => {
    const { name } = req.params;
    const progress = getProgress(name);
    res.json({ success: true, progress });
  });
  
  // Environment management routes
  router.get('/environments', environmentRoutes.listEnvironments);
  router.get('/environments/:name', environmentRoutes.getEnvironment);
  router.post('/environments', environmentRoutes.createEnvironment);
  router.put('/environments/:name', environmentRoutes.updateEnvironment);
  router.delete('/environments/:name', environmentRoutes.deleteEnvironment);
  router.post('/environments/:name/start', environmentRoutes.startEnvironment);
  router.post('/environments/:name/stop', environmentRoutes.stopEnvironment);
  
  // Documentation routes
  router.get('/docs/list', docsRoutes.listDocs);
  router.get('/docs/content/:path(*)', docsRoutes.getDocContent);
  router.get('/docs/content', docsRoutes.getDocContent);
  
  app.use('/api', router);
}

module.exports = { setupRoutes };

