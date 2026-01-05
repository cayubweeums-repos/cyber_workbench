import { create } from 'zustand';
import { environmentAPI } from '../services/api';

const useEnvironmentStore = create((set, get) => ({
  environments: [],
  currentEnvironment: null,
  loading: false,
  error: null,
  
  // Load all environments
  loadEnvironments: async () => {
    set({ loading: true, error: null });
    try {
      const response = await environmentAPI.list();
      set({ environments: response.data.environments || [], loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },
  
  // Load a specific environment
  loadEnvironment: async (envId) => {
    set({ loading: true, error: null });
    try {
      const response = await environmentAPI.get(envId);
      set({ currentEnvironment: response.data.environment, loading: false });
      return response.data.environment;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },
  
  // Create a new environment
  createEnvironment: async (envData) => {
    set({ loading: true, error: null });
    try {
      const response = await environmentAPI.create(envData);
      const newEnv = response.data.environment;
      set(state => ({
        environments: [...state.environments, newEnv],
        currentEnvironment: newEnv,
        loading: false
      }));
      return newEnv;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },
  
  // Start an environment
  startEnvironment: async (envId) => {
    set({ loading: true, error: null });
    try {
      const response = await environmentAPI.start(envId);
      const updatedEnv = response.data.environment;
      set(state => ({
        environments: state.environments.map(env => 
          env.id === envId ? updatedEnv : env
        ),
        currentEnvironment: state.currentEnvironment?.id === envId 
          ? updatedEnv 
          : state.currentEnvironment,
        loading: false
      }));
      return updatedEnv;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },
  
  // Stop an environment
  stopEnvironment: async (envId) => {
    set({ loading: true, error: null });
    try {
      const response = await environmentAPI.stop(envId);
      const updatedEnv = response.data.environment;
      set(state => ({
        environments: state.environments.map(env => 
          env.id === envId ? updatedEnv : env
        ),
        currentEnvironment: state.currentEnvironment?.id === envId 
          ? updatedEnv 
          : state.currentEnvironment,
        loading: false
      }));
      return updatedEnv;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },
  
  // Delete an environment
  deleteEnvironment: async (envId) => {
    set({ loading: true, error: null });
    try {
      await environmentAPI.delete(envId);
      set(state => ({
        environments: state.environments.filter(env => env.id !== envId),
        currentEnvironment: state.currentEnvironment?.id === envId 
          ? null 
          : state.currentEnvironment,
        loading: false
      }));
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },
  
  // Refresh environment status
  refreshEnvironmentStatus: async (envId) => {
    try {
      const response = await environmentAPI.getStatus(envId);
      const updatedEnv = response.data.environment;
      set(state => ({
        environments: state.environments.map(env => 
          env.id === envId ? updatedEnv : env
        ),
        currentEnvironment: state.currentEnvironment?.id === envId 
          ? updatedEnv 
          : state.currentEnvironment
      }));
      return updatedEnv;
    } catch (error) {
      console.error('Failed to refresh environment status:', error);
    }
  },
  
  // Set current environment
  setCurrentEnvironment: (env) => {
    set({ currentEnvironment: env });
  },
  
  // Clear error
  clearError: () => {
    set({ error: null });
  }
}));

export default useEnvironmentStore;

