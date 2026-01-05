const client = require('prom-client');

// Create registry
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics

// Counter: Total VM starts
const vmStartsTotal = new client.Counter({
  name: 'vm_starts_total',
  help: 'Total number of VM starts',
  labelNames: ['os_type', 'vm_name'],
  registers: [register],
});

// Counter: Total VM stops
const vmStopsTotal = new client.Counter({
  name: 'vm_stops_total',
  help: 'Total number of VM stops',
  labelNames: ['os_type', 'vm_name'],
  registers: [register],
});

// Counter: Total VM cleanups
const vmCleanupTotal = new client.Counter({
  name: 'vm_cleanup_total',
  help: 'Total number of VM cleanups',
  labelNames: ['os_type', 'vm_name', 'cleanup_reason'],
  registers: [register],
});

// Gauge: Currently running VM instances
const vmRunningInstances = new client.Gauge({
  name: 'vm_running_instances',
  help: 'Number of currently running VM instances',
  registers: [register],
});

// Gauge: Total RAM allocated (GB)
const vmTotalRamGB = new client.Gauge({
  name: 'vm_total_ram_gb',
  help: 'Total RAM allocated to VMs in gigabytes',
  registers: [register],
});

// Gauge: Total CPU cores allocated
const vmTotalCpuCores = new client.Gauge({
  name: 'vm_total_cpu_cores',
  help: 'Total CPU cores allocated to VMs',
  registers: [register],
});

// Histogram: VM startup duration
const vmStartupDuration = new client.Histogram({
  name: 'vm_startup_duration_seconds',
  help: 'Time taken to start a VM in seconds',
  labelNames: ['os_type'],
  buckets: [5, 10, 30, 60, 120, 300, 600],
  registers: [register],
});

// Histogram: VM lifetime
const vmLifetimeSeconds = new client.Histogram({
  name: 'vm_lifetime_seconds',
  help: 'Total lifetime of VMs in seconds',
  labelNames: ['os_type', 'vm_name'],
  buckets: [60, 300, 600, 1800, 3600, 7200, 14400, 28800],
  registers: [register],
});

// Counter: Template operations
const templateOperationsTotal = new client.Counter({
  name: 'template_operations_total',
  help: 'Total number of template operations',
  labelNames: ['operation', 'os_type', 'vm_name', 'status'],
  registers: [register],
});

// Counter: Clone operations
const cloneOperationsTotal = new client.Counter({
  name: 'clone_operations_total',
  help: 'Total number of clone operations',
  labelNames: ['os_type', 'vm_name', 'status'],
  registers: [register],
});

/**
 * Helper functions to update metrics
 */

function incrementStarts(osType, vmName) {
  vmStartsTotal.inc({ os_type: osType, vm_name: vmName });
}

function incrementStops(osType, vmName) {
  vmStopsTotal.inc({ os_type: osType, vm_name: vmName });
}

function incrementCleanup(osType, vmName, reason) {
  vmCleanupTotal.inc({ os_type: osType, vm_name: vmName, cleanup_reason: reason });
}

function setRunningInstances(count) {
  vmRunningInstances.set(count);
}

function setTotalRam(ramGB) {
  vmTotalRamGB.set(ramGB);
}

function setTotalCpu(cpuCores) {
  vmTotalCpuCores.set(cpuCores);
}

function recordStartupDuration(osType, durationSeconds) {
  vmStartupDuration.observe({ os_type: osType }, durationSeconds);
}

function recordLifetime(osType, vmName, lifetimeSeconds) {
  vmLifetimeSeconds.observe({ os_type: osType, vm_name: vmName }, lifetimeSeconds);
}

function incrementTemplate(operation, osType, vmName, status) {
  templateOperationsTotal.inc({ 
    operation, 
    os_type: osType, 
    vm_name: vmName, 
    status 
  });
}

function incrementClone(osType, vmName, status) {
  cloneOperationsTotal.inc({ 
    os_type: osType, 
    vm_name: vmName, 
    status 
  });
}

/**
 * Update resource metrics from current state
 */
async function updateResourceMetrics() {
  const { getTotalResourceUsage } = require('./limits');
  
  try {
    const usage = await getTotalResourceUsage();
    setRunningInstances(usage.instances);
    setTotalRam(usage.ramGB);
    setTotalCpu(usage.cpuCores);
  } catch (error) {
    console.error('[Metrics] Error updating resource metrics:', error);
  }
}

// Update resource metrics every 30 seconds
setInterval(updateResourceMetrics, 30000);
updateResourceMetrics(); // Initial update

module.exports = {
  register,
  incrementStarts,
  incrementStops,
  incrementCleanup,
  setRunningInstances,
  setTotalRam,
  setTotalCpu,
  recordStartupDuration,
  recordLifetime,
  incrementTemplate,
  incrementClone,
  updateResourceMetrics,
};

