#!/usr/bin/env node
/**
 * Get websockify port for a VM
 */

const path = require('path');
const fs = require('fs');

const vmName = process.argv[2];

if (!vmName) {
  console.error('Usage: node get_websockify_port.js <vm_name>');
  process.exit(1);
}

const trackerFile = path.join(__dirname, 'nginx', 'vm-tracker.json');

if (!fs.existsSync(trackerFile)) {
  console.error(`VM tracker file not found: ${trackerFile}`);
  console.error('Make sure the VM is running and websockify has been started');
  process.exit(1);
}

try {
  const trackerData = JSON.parse(fs.readFileSync(trackerFile, 'utf8'));
  const vmData = trackerData[vmName];
  
  if (!vmData) {
    console.error(`VM ${vmName} not found in tracker`);
    console.error('Available VMs:', Object.keys(trackerData).join(', '));
    process.exit(1);
  }
  
  const websockifyPort = vmData.websockifyPort;
  console.log(`VM: ${vmName}`);
  console.log(`Websockify Port: ${websockifyPort}`);
  console.log();
  console.log(`Test direct connection:`);
  console.log(`  node test_websocket.js ${vmName} ${websockifyPort}`);
} catch (error) {
  console.error(`Error reading tracker file: ${error.message}`);
  process.exit(1);
}

