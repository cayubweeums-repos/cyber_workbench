#!/usr/bin/env node
/**
 * Test WebSocket connection to websockify
 * This helps debug WebSocket connection issues
 */

const WebSocket = require('ws');

const vmName = process.argv[2] || 'test_vm';
const websockifyPort = parseInt(process.argv[3]) || 6080;

console.log(`Testing WebSocket connection to websockify...`);
console.log(`VM: ${vmName}`);
console.log(`Direct websockify port: ${websockifyPort}`);
console.log(`Express proxy path: ws://localhost:3000/websockify/${vmName}`);
console.log();

// Test 1: Direct connection to websockify
console.log(`Test 1: Direct connection to websockify (ws://127.0.0.1:${websockifyPort})`);
const directWs = new WebSocket(`ws://127.0.0.1:${websockifyPort}`);

directWs.on('open', () => {
  console.log('✓ Direct WebSocket connection opened');
  directWs.close();
});

directWs.on('error', (error) => {
  console.log(`✗ Direct WebSocket connection failed: ${error.message}`);
});

directWs.on('close', () => {
  console.log('Direct connection closed');
  console.log();
  
  // Test 2: Connection through Express proxy
  console.log(`Test 2: Connection through Express proxy (ws://localhost:3000/websockify/${vmName})`);
  const proxyWs = new WebSocket(`ws://localhost:3000/websockify/${vmName}`);
  
  proxyWs.on('open', () => {
    console.log('✓ Express proxy WebSocket connection opened');
    proxyWs.close();
  });
  
  proxyWs.on('error', (error) => {
    console.log(`✗ Express proxy WebSocket connection failed: ${error.message}`);
    console.log(`  This indicates the Express proxy is not working correctly`);
  });
  
  proxyWs.on('close', () => {
    console.log('Proxy connection closed');
    process.exit(0);
  });
  
  setTimeout(() => {
    if (proxyWs.readyState === WebSocket.CONNECTING) {
      console.log('✗ Express proxy WebSocket connection timed out');
      proxyWs.close();
      process.exit(1);
    }
  }, 5000);
});

setTimeout(() => {
  if (directWs.readyState === WebSocket.CONNECTING) {
    console.log('✗ Direct WebSocket connection timed out');
    directWs.close();
    process.exit(1);
  }
}, 5000);

