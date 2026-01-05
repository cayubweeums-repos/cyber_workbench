const express = require('express');
const multer = require('multer');

const upload = multer({ dest: '/tmp/uploads/' });

// Import API handlers
const { getStatus, getVmStatus, getBuildStatus } = require('./status');
const { listVMs, startVM, stopVM, restartVM, extendVM, deleteVM } = require('./vm');
const { getViewers } = require('./viewers');
const { browseFiles, downloadFile, uploadFile, deleteFile } = require('./files');
const { getClipboard, setClipboard } = require('./clipboard');
const { executeCommandInVM } = require('./execute');
const { listRecordings, listAllRecordings, convertRecording, downloadRecording, deleteRecording } = require('./recordings');
const { getMetrics, getMetricsSummary } = require('./metrics');
const { markVmAsTemplate, unmarkVmAsTemplate, getTemplateInfoHandler } = require('./template');
const { createCloneFromTemplate, listClonesOfTemplate } = require('./clone');
const { getNetworks, postNetwork, getNetworkInspect, deleteNetworkHandler } = require('./networks');
const { updateVmNetworks } = require('./vm-networks');
const { 
  listEnvironments, 
  getEnvironment, 
  createEnvironment, 
  startEnvironment, 
  stopEnvironment, 
  deleteEnvironment, 
  getEnvironmentStatus,
  setBuildState 
} = require('./environments');
const {
  listContainers,
  createContainer,
  startContainer,
  stopContainer,
  deleteContainer,
  getContainerStatus
} = require('./containers');

/**
 * Setup all API routes
 */
function setupRoutes(app, buildState) {
  // Status routes
  app.get('/api/build-status', getBuildStatus(buildState));
  app.get('/api/status', getStatus);
  app.get('/api/status/:containerName', getVmStatus);
  
  // VM management routes
  app.get('/api/vms', listVMs);
  app.post('/api/start', (req, res) => startVM(req, res, buildState));
  app.post('/api/stop/:containerName', stopVM);
  app.post('/api/restart/:containerName', restartVM);
  app.post('/api/extend/:containerName', extendVM);
  app.delete('/api/vm/:containerName', deleteVM);
  app.post('/api/vm/:containerName/networks', updateVmNetworks);

  // Viewer discovery (API-first)
  app.get('/api/vm/:containerName/viewers', getViewers);
  
  // File operations
  app.get('/api/files/:containerName/browse', browseFiles);
  app.get('/api/files/:containerName/download', downloadFile);
  app.post('/api/files/:containerName/upload', upload.single('file'), uploadFile);
  app.delete('/api/files/:containerName', deleteFile);
  
  // Clipboard operations
  app.get('/api/clipboard/:containerName', getClipboard);
  app.post('/api/clipboard/:containerName', setClipboard);
  
  // Command execution
  app.post('/api/execute/:containerName', executeCommandInVM);
  
  // Recording operations
  app.get('/api/recordings', listAllRecordings);
  app.get('/api/recordings/:containerName', listRecordings);
  app.post('/api/recordings/:containerName/:filename/convert', convertRecording);
  app.get('/api/recordings/:containerName/:filename/download', downloadRecording);
  app.delete('/api/recordings/:containerName/:filename', deleteRecording);
  
  // Metrics endpoints
  app.get('/metrics', getMetrics);
  app.get('/api/metrics/summary', getMetricsSummary);
  
  // Template operations
  app.post('/api/template/mark/:containerName', markVmAsTemplate);
  app.post('/api/template/unmark/:containerName', unmarkVmAsTemplate);
  app.get('/api/template/info/:containerName', getTemplateInfoHandler);
  
  // Clone operations
  app.post('/api/clone/create/:templateName', (req, res) => createCloneFromTemplate(req, res, buildState));
  app.get('/api/clone/list/:templateName', listClonesOfTemplate);

  // Network management (Docker networks)
  app.get('/api/networks', getNetworks);
  app.post('/api/networks', postNetwork);
  app.get('/api/networks/:idOrName', getNetworkInspect);
  app.delete('/api/networks/:idOrName', deleteNetworkHandler);
  
  // Environment management
  app.get('/api/environments', listEnvironments);
  app.get('/api/environments/:envId', getEnvironment);
  app.post('/api/environments', (req, res) => createEnvironment(req, res));
  app.post('/api/environments/:envId/start', startEnvironment);
  app.post('/api/environments/:envId/stop', stopEnvironment);
  app.delete('/api/environments/:envId', deleteEnvironment);
  app.get('/api/environments/:envId/status', getEnvironmentStatus);
  
  // Container management
  app.get('/api/containers', listContainers);
  app.post('/api/containers', createContainer);
  app.post('/api/containers/:containerName/start', startContainer);
  app.post('/api/containers/:containerName/stop', stopContainer);
  app.delete('/api/containers/:containerName', deleteContainer);
  app.get('/api/containers/:containerName/status', getContainerStatus);
  
  // Initialize build state for environments
  setBuildState(buildState);
}

module.exports = { setupRoutes };

