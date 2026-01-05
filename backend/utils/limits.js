const { listContainers } = require('./docker');

// Load resource limits from environment variables
const LIMITS = {
  maxInstances: parseInt(process.env.VM_MAX_INSTANCES || '10', 10),
  maxTotalRamGB: parseInt(process.env.VM_MAX_TOTAL_RAM_GB || '64', 10),
  maxTotalCpuCores: parseInt(process.env.VM_MAX_TOTAL_CPU_CORES || '32', 10),
};

/**
 * Parse RAM string (e.g., "8G", "4096M") to GB
 */
function parseRamToGB(ramStr) {
  const match = ramStr.match(/^(\d+)([GM])$/i);
  if (!match) return 0;
  
  const value = parseInt(match[1], 10);
  const unit = match[2].toUpperCase();
  
  if (unit === 'G') return value;
  if (unit === 'M') return value / 1024;
  return 0;
}

/**
 * Get total resource usage from running Windows VMs
 */
async function getTotalResourceUsage() {
  try {
    const containers = await listContainers({ all: false });
    const windowsContainers = containers.filter(c => 
      c.Names.some(name => name.match(/\/win\d+_/))
    );
    
    let totalRamGB = 0;
    let totalCpuCores = 0;
    
    for (const container of windowsContainers) {
      const env = container.Labels || {};
      const ramStr = env['vapiorc.ram'] || '0G';
      const cpuStr = env['vapiorc.cpu'] || '0';
      
      totalRamGB += parseRamToGB(ramStr);
      totalCpuCores += parseInt(cpuStr, 10);
    }
    
    return {
      instances: windowsContainers.length,
      ramGB: totalRamGB,
      cpuCores: totalCpuCores,
    };
  } catch (error) {
    console.error('Error calculating resource usage:', error);
    return { instances: 0, ramGB: 0, cpuCores: 0 };
  }
}

/**
 * Check if a new VM can be created with requested resources
 */
async function checkCanCreateVM(requestedRam, requestedCpu) {
  const current = await getTotalResourceUsage();
  const requestedRamGB = parseRamToGB(requestedRam);
  const requestedCpuCores = parseInt(requestedCpu, 10);
  
  // Check instance count
  if (current.instances >= LIMITS.maxInstances) {
    return {
      allowed: false,
      reason: `Maximum VM instances reached (${current.instances}/${LIMITS.maxInstances})`,
    };
  }
  
  // Check total RAM
  if (current.ramGB + requestedRamGB > LIMITS.maxTotalRamGB) {
    return {
      allowed: false,
      reason: `Total RAM limit exceeded (${current.ramGB + requestedRamGB}GB requested, ${LIMITS.maxTotalRamGB}GB max)`,
    };
  }
  
  // Check total CPU
  if (current.cpuCores + requestedCpuCores > LIMITS.maxTotalCpuCores) {
    return {
      allowed: false,
      reason: `Total CPU cores limit exceeded (${current.cpuCores + requestedCpuCores} requested, ${LIMITS.maxTotalCpuCores} max)`,
    };
  }
  
  return {
    allowed: true,
    available: {
      instances: LIMITS.maxInstances - current.instances,
      ramGB: LIMITS.maxTotalRamGB - current.ramGB,
      cpuCores: LIMITS.maxTotalCpuCores - current.cpuCores,
    },
  };
}

/**
 * Get resource limits and current usage
 */
async function getResourceInfo() {
  const current = await getTotalResourceUsage();
  
  return {
    limits: LIMITS,
    current,
    available: {
      instances: Math.max(0, LIMITS.maxInstances - current.instances),
      ramGB: Math.max(0, LIMITS.maxTotalRamGB - current.ramGB),
      cpuCores: Math.max(0, LIMITS.maxTotalCpuCores - current.cpuCores),
    },
  };
}

module.exports = {
  LIMITS,
  parseRamToGB,
  getTotalResourceUsage,
  checkCanCreateVM,
  getResourceInfo,
};

