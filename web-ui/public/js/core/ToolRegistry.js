/**
 * Tool Registry - Registry for embedded tools (SentinelOneAgent, etc.)
 * Makes it easy to add new tools without code changes
 */
class ToolRegistry {
  constructor() {
    this.tools = {};
    this.registerDefaults();
  }

  register(toolName, toolConfig) {
    // toolConfig: { name, description, compatibleServiceTypes: [], requiresInput: { fields: [] }, installMethod }
    this.tools[toolName] = toolConfig;
  }

  get(toolName) {
    return this.tools[toolName] || null;
  }

  getAll() {
    return Object.values(this.tools);
  }

  getToolsForServiceType(serviceType) {
    return Object.values(this.tools).filter(tool => 
      tool.compatibleServiceTypes.includes(serviceType)
    );
  }

  registerDefaults() {
    // Register SentinelOneAgent tool
    this.register('SentinelOneAgent', {
      name: 'Sentinel One Agent',
      description: 'Install SentinelOne security agent on the VM',
      compatibleServiceTypes: ['WindowsVM'],
      requiresInput: {
        fields: [
          {
            name: 'installation_command',
            label: 'Installation Command',
            type: 'text',
            placeholder: 'Enter the installation command or script path',
            required: true
          }
        ]
      },
      installMethod: 'command' // Method to use for installing this tool
    });
    
    // Easy to add more tools here:
    // this.register('CrowdStrikeAgent', { ... });
  }
}

// Global tool registry instance
const ToolRegistry = new ToolRegistry();

