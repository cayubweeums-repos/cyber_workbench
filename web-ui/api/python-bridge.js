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
    // Use unbuffered Python output for real-time logging
    const proc = spawn(python, ['-u', '-c', pythonScript], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      // Only log if DEBUG is enabled or if it's an error
      if (process.env.DEBUG_PYTHON_BRIDGE === '1') {
        console.log(`[Python Bridge ${moduleName}.${functionName}]`, text);
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      // Always log errors
      console.error(`[Python Bridge ${moduleName}.${functionName} ERROR]`, text);
    });

    proc.on('close', (code) => {
      // Only log if DEBUG is enabled or if there's an error
      if (process.env.DEBUG_PYTHON_BRIDGE === '1' || code !== 0) {
        console.log(`[Python Bridge ${moduleName}.${functionName}] Process exited with code ${code}`);
      }
      if (code !== 0) {
        const errorMsg = `Python process exited with code ${code}: ${stderr}`;
        console.error(`[Python Bridge ${moduleName}.${functionName}]`, errorMsg);
        reject(new Error(errorMsg));
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (result.success) {
          resolve(result.data !== undefined ? result.data : result);
        } else {
          const errorMsg = result.error || 'Python function returned failure';
          console.error(`[Python Bridge ${moduleName}.${functionName}]`, errorMsg);
          reject(new Error(errorMsg));
        }
      } catch (e) {
        const errorMsg = `Failed to parse Python output: ${e.message}\nOutput: ${stdout}`;
        console.error(`[Python Bridge ${moduleName}.${functionName}]`, errorMsg);
        reject(new Error(errorMsg));
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
    import base64
    instance_args_b64 = '${Buffer.from(JSON.stringify(instanceArgs)).toString('base64')}'
    instance_args_json = base64.b64decode(instance_args_b64).decode('utf-8')
    instance_args = json.loads(instance_args_json)
    instance = ${className}(**instance_args)
    
    method_args_b64 = '${Buffer.from(JSON.stringify(methodArgs)).toString('base64')}'
    method_args_json = base64.b64decode(method_args_b64).decode('utf-8')
    method_args = json.loads(method_args_json)
    result = instance.${methodName}(**method_args)
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
    import traceback
    error_details = traceback.format_exc()
    # Only output JSON to stdout - errors go to stderr for logging
    error_output = json.dumps({"success": False, "error": str(e), "traceback": error_details})
    print(error_output, file=sys.stderr)
    print(json.dumps({"success": False, "error": str(e)}))
    sys.exit(1)
`;

    const python = getPythonExecutable();
    // Use unbuffered Python output for real-time logging
    const proc = spawn(python, ['-u', '-c', pythonScript], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      // Only log if DEBUG is enabled or if it's an error
      if (process.env.DEBUG_PYTHON_BRIDGE === '1') {
        console.log(`[Python Bridge ${moduleName}.${className}.${methodName}]`, text);
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      // Always log errors
      console.error(`[Python Bridge ${moduleName}.${className}.${methodName} ERROR]`, text);
    });

    proc.on('close', (code) => {
      // Only log if DEBUG is enabled or if there's an error
      if (process.env.DEBUG_PYTHON_BRIDGE === '1' || code !== 0) {
        console.log(`[Python Bridge ${moduleName}.${className}.${methodName}] Process exited with code ${code}`);
      }
      if (code !== 0) {
        const errorMsg = `Python process exited with code ${code}: ${stderr}`;
        console.error(`[Python Bridge ${moduleName}.${className}.${methodName}]`, errorMsg);
        reject(new Error(errorMsg));
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (result.success) {
          resolve(result.data !== undefined ? result.data : result);
        } else {
          const errorMsg = result.error || 'Python function returned failure';
          console.error(`[Python Bridge ${moduleName}.${className}.${methodName}]`, errorMsg);
          if (result.traceback) {
            console.error(`[Python Bridge ${moduleName}.${className}.${methodName} TRACEBACK]`, result.traceback);
          }
          reject(new Error(errorMsg));
        }
      } catch (e) {
        const errorMsg = `Failed to parse Python output: ${e.message}\nOutput: ${stdout}`;
        console.error(`[Python Bridge ${moduleName}.${className}.${methodName}]`, errorMsg);
        reject(new Error(errorMsg));
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

