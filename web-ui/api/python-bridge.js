/**
 * Python Bridge - Interface to call Python modules via subprocess
 */

const { spawn } = require('child_process');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const PYTHON_VENV = path.join(REPO_ROOT, 'venv', 'bin', 'python');
const PYTHON3 = 'python3';

/**
 * Get Python executable path
 */
function getPythonExecutable() {
  const fs = require('fs');
  // Try venv first, then system python3
  if (fs.existsSync(PYTHON_VENV)) {
    return PYTHON_VENV;
  }
  return PYTHON3;
}

// Export for use in other modules
module.exports.getPythonExecutable = getPythonExecutable;

/**
 * Execute Python module function and return JSON result
 */
function callPythonModule(moduleName, functionName, args = {}) {
  return new Promise((resolve, reject) => {
    const pythonScript = `
import sys
import json
import os
sys.path.insert(0, '${REPO_ROOT}')

from ${moduleName} import ${functionName}

try:
    result = ${functionName}(**${JSON.stringify(args)})
    if isinstance(result, bool):
        output = {"success": result}
    elif isinstance(result, (list, dict)):
        output = {"success": True, "data": result}
    else:
        output = {"success": True, "data": result}
    print(json.dumps(output))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
    sys.exit(1)
`;

    const python = getPythonExecutable();
    const proc = spawn(python, ['-c', pythonScript], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (result.success) {
          resolve(result.data !== undefined ? result.data : result);
        } else {
          reject(new Error(result.error || 'Python function returned failure'));
        }
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${e.message}\nOutput: ${stdout}`));
      }
    });
  });
}

/**
 * Execute Python module method on an instance
 */
function callPythonInstanceMethod(moduleName, className, instanceArgs, methodName, methodArgs = {}) {
  return new Promise((resolve, reject) => {
    const pythonScript = `
import sys
import json
import os
sys.path.insert(0, '${REPO_ROOT}')

from ${moduleName} import ${className}

try:
    instance = ${className}(**${JSON.stringify(instanceArgs)})
    result = instance.${methodName}(**${JSON.stringify(methodArgs)})
    if isinstance(result, bool):
        output = {"success": result}
    elif isinstance(result, (list, dict)):
        output = {"success": True, "data": result}
    elif hasattr(result, 'to_dict'):
        # Handle objects with to_dict method (like VMConfig)
        output = {"success": True, "data": result.to_dict()}
    else:
        output = {"success": True, "data": result}
    print(json.dumps(output))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
    sys.exit(1)
`;

    const python = getPythonExecutable();
    const proc = spawn(python, ['-c', pythonScript], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (result.success) {
          resolve(result.data !== undefined ? result.data : result);
        } else {
          reject(new Error(result.error || 'Python function returned failure'));
        }
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${e.message}\nOutput: ${stdout}`));
      }
    });
  });
}

/**
 * Check if VM is running (uses pgrep)
 */
function isVMRunning(vmName) {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    exec(`pgrep -f "windows.img.*${vmName}"`, (error, stdout) => {
      resolve(!error && stdout.trim().length > 0);
    });
  });
}

module.exports = {
  callPythonModule,
  callPythonInstanceMethod,
  isVMRunning,
  getPythonExecutable,
  REPO_ROOT
};

