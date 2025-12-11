#!/usr/bin/env node
/**
 * Check if noVNC is properly set up
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname);
const novncDir = path.join(REPO_ROOT, 'novnc');
const vncHtml = path.join(novncDir, 'vnc.html');

console.log('Checking noVNC setup...\n');

// Check if directory exists
if (!fs.existsSync(novncDir)) {
  console.error('ERROR: noVNC directory does not exist');
  console.error(`   Expected: ${novncDir}`);
  console.error('\n   Run: make setup-novnc');
  process.exit(1);
}

console.log('SUCCESS: noVNC directory exists');

// Check if vnc.html exists
if (!fs.existsSync(vncHtml)) {
  console.error('ERROR: vnc.html not found');
  console.error(`   Expected: ${vncHtml}`);
  console.error('\n   Run: make setup-novnc');
  process.exit(1);
}

console.log('SUCCESS: vnc.html exists');

// Check if required noVNC files exist
const requiredFiles = [
  'vnc.html',
  'app/ui.js',
  'core/rfb.js'
];

let allFilesExist = true;
for (const file of requiredFiles) {
  const filePath = path.join(novncDir, file);
  if (fs.existsSync(filePath)) {
    console.log(`SUCCESS: ${file} exists`);
  } else {
    console.error(`ERROR: ${file} not found`);
    allFilesExist = false;
  }
}

if (!allFilesExist) {
  console.error('\n   Some required noVNC files are missing');
  console.error('   Run: make setup-novnc');
  process.exit(1);
}

console.log('\nSUCCESS: noVNC is properly set up!');
console.log(`   Files are available at: ${novncDir}`);
console.log(`   Access via: http://localhost:3000/novnc/vnc.html`);

