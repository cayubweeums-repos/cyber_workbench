/**
 * VM Operations - Wrapper for Python vm_operations module
 */

const { spawn } = require('child_process');
const path = require('path');
const { REPO_ROOT } = require('./python-bridge');

/**
 * Create VM disk image
 */
async function createVMDisk(vmName, sizeGb) {
  return new Promise((resolve, reject) => {
    const python = require('./python-bridge').getPythonExecutable();
    const script = `
import sys
sys.path.insert(0, '${REPO_ROOT}')
from vm_operations import VMOperations

ops = VMOperations('${REPO_ROOT}')
result = ops.create_vm_disk('${vmName}', ${sizeGb})
print('SUCCESS' if result else 'FAILED')
`;

    const proc = spawn(python, ['-c', script], { cwd: REPO_ROOT });
    let output = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && output.includes('SUCCESS')) {
        resolve(true);
      } else {
        reject(new Error(`Failed to create disk: ${output}`));
      }
    });
  });
}

/**
 * Download Windows ISO
 */
async function downloadWindowsISO() {
  return new Promise((resolve, reject) => {
    const python = require('./python-bridge').getPythonExecutable();
    const script = `
import sys
sys.path.insert(0, '${REPO_ROOT}')
from vm_operations import VMOperations

ops = VMOperations('${REPO_ROOT}')
result = ops.download_windows_iso()
print('SUCCESS' if result else 'FAILED')
`;

    const proc = spawn(python, ['-c', script], { cwd: REPO_ROOT });
    let output = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && output.includes('SUCCESS')) {
        resolve(true);
      } else {
        reject(new Error(`Failed to download ISO: ${output}`));
      }
    });
  });
}

/**
 * Prepare ISO for VM (with progress callback)
 */
async function prepareISOForVM(vmName, progressCallback) {
  return new Promise((resolve, reject) => {
    const python = require('./python-bridge').getPythonExecutable();
    const script = `
import sys
sys.path.insert(0, '${REPO_ROOT}')
from vm_operations import VMOperations

def progress(msg):
    print(f"PROGRESS:{msg}", flush=True)

ops = VMOperations('${REPO_ROOT}')
result = ops.prepare_iso_for_vm('${vmName}', progress)
print('SUCCESS' if result else 'FAILED')
`;

    const proc = spawn(python, ['-c', script], { cwd: REPO_ROOT });
    let output = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      
      // Parse progress messages
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('PROGRESS:')) {
          const message = line.substring(9);
          if (progressCallback) {
            progressCallback(message);
          }
        }
      }
    });

    proc.stderr.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && output.includes('SUCCESS')) {
        resolve(true);
      } else {
        reject(new Error(`Failed to prepare ISO: ${output}`));
      }
    });
  });
}

/**
 * Start VM
 */
async function startVM(vmName, config) {
  return new Promise((resolve, reject) => {
    const python = require('./python-bridge').getPythonExecutable();
    // Use base64 encoding to safely pass JSON to Python
    const configJson = Buffer.from(JSON.stringify(config)).toString('base64');
    const script = `
import sys
import json
import base64
sys.path.insert(0, '${REPO_ROOT}')
from vm_manager import VMConfig
from vm_operations import VMOperations

try:
    config_json = base64.b64decode('${configJson}').decode('utf-8')
    config_dict = json.loads(config_json)
    config = VMConfig.from_dict(config_dict)
    
    ops = VMOperations('${REPO_ROOT}')
    result = ops.start_vm('${vmName}', config)
    print('SUCCESS' if result else 'FAILED')
except Exception as e:
    import traceback
    print(f'ERROR: {e}')
    traceback.print_exc()
    sys.exit(1)
`;

    const proc = spawn(python, ['-c', script], { cwd: REPO_ROOT });
    let output = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && output.includes('SUCCESS')) {
        resolve(true);
      } else {
        reject(new Error(`Failed to start VM: ${output}`));
      }
    });
  });
}

/**
 * Stop VM
 */
async function stopVM(vmName) {
  return new Promise((resolve, reject) => {
    const python = require('./python-bridge').getPythonExecutable();
    const script = `
import sys
sys.path.insert(0, '${REPO_ROOT}')
from vm_operations import VMOperations

ops = VMOperations('${REPO_ROOT}')
result = ops.stop_vm('${vmName}')
print('SUCCESS' if result else 'FAILED')
`;

    const proc = spawn(python, ['-c', script], { cwd: REPO_ROOT });
    let output = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && output.includes('SUCCESS')) {
        resolve(true);
      } else {
        reject(new Error(`Failed to stop VM: ${output}`));
      }
    });
  });
}

/**
 * Start websockify proxy
 */
async function startWebsockify(vmName, vncPort = 5900) {
  return new Promise((resolve, reject) => {
    const python = require('./python-bridge').getPythonExecutable();
    const script = `
import sys
sys.path.insert(0, '${REPO_ROOT}')
from vm_operations import VMOperations

ops = VMOperations('${REPO_ROOT}')
port = ops.start_websockify('${vmName}', ${vncPort})
if port:
    print(f"PORT:{port}")
else:
    print("FAILED")
`;

    const proc = spawn(python, ['-c', script], { cwd: REPO_ROOT });
    let output = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      const match = output.match(/PORT:(\d+)/);
      if (match) {
        resolve(parseInt(match[1]));
      } else {
        reject(new Error(`Failed to start websockify: ${output}`));
      }
    });
  });
}

module.exports = {
  createVMDisk,
  downloadWindowsISO,
  prepareISOForVM,
  startVM,
  stopVM,
  startWebsockify
};

