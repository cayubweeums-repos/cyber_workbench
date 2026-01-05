import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Environment API
export const environmentAPI = {
  list: () => api.get('/environments'),
  get: (envId) => api.get(`/environments/${envId}`),
  create: (envData) => api.post('/environments', envData),
  start: (envId) => api.post(`/environments/${envId}/start`),
  stop: (envId) => api.post(`/environments/${envId}/stop`),
  delete: (envId) => api.delete(`/environments/${envId}`),
  getStatus: (envId) => api.get(`/environments/${envId}/status`)
};

// Node API
export const nodeAPI = {
  listVMs: () => api.get('/vms'),
  createVM: (vmData) => api.post('/start', vmData),
  startVM: (containerName) => api.post(`/stop/${containerName}`),
  stopVM: (containerName) => api.post(`/stop/${containerName}`),
  deleteVM: (containerName) => api.delete(`/vm/${containerName}`),
  getViewers: (containerName) => api.get(`/vm/${containerName}/viewers`)
};

// Container API
export const containerAPI = {
  list: () => api.get('/containers'),
  create: (containerData) => api.post('/containers', containerData),
  start: (containerName) => api.post(`/containers/${containerName}/start`),
  stop: (containerName) => api.post(`/containers/${containerName}/stop`),
  delete: (containerName) => api.delete(`/containers/${containerName}`),
  getStatus: (containerName) => api.get(`/containers/${containerName}/status`)
};

// Network API
export const networkAPI = {
  list: () => api.get('/networks'),
  create: (networkData) => api.post('/networks', networkData),
  get: (networkId) => api.get(`/networks/${networkId}`),
  delete: (networkId) => api.delete(`/networks/${networkId}`)
};

export default api;

