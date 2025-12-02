/**
 * VM Operations - Wrapper for Python vm_operations module
 */

const { spawn } = require('child_process');
const path = require('path');
const { REPO_ROOT } = require('./python-bridge');
const { setProgress, clearProgress } = require('./progress');

/**
 * Create VM disk image
 */
async function createVMDisk(vmName, sizeGb) {
  setProgress(vmName, {
    stage: 'Creating disk image',
    message: `Creating ${sizeGb}GB disk image...`,
    percent: 0
  });
  
  return new Promise((resolve, reject) => {
    const python = require('./python-bridge').getPythonExecutable();
    const script = `
import sys
import traceback
sys.path.insert(0, '${REPO_ROOT}')

try:
    from vm_operations import VMOperations
    
    ops = VMOperations('${REPO_ROOT}')
    result = ops.create_vm_disk('${vmName}', ${sizeGb})
    if result:
        print('SUCCESS', flush=True)
        sys.exit(0)
    else:
        print('FAILED: create_vm_disk returned False', file=sys.stderr, flush=True)
        sys.exit(1)
except Exception as e:
    print(f'ERROR: {str(e)}', file=sys.stderr, flush=True)
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
`;

    // Use unbuffered Python output for real-time logging
    const proc = spawn(python, ['-u', '-c', script], { 
      cwd: REPO_ROOT,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['pipe', 'pipe', 'pipe'] // Explicitly set stdio to capture all output
    });
    let output = '';
    let errors = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log(`[Disk Creation ${vmName}]`, text);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      errors += text;
      console.error(`[Disk Creation ${vmName} ERROR]`, text);
    });

    proc.on('error', (err) => {
      // Handle spawn errors (e.g., Python executable not found)
      console.error(`[Disk Creation ${vmName}] Spawn error:`, err);
      clearProgress(vmName);
      reject(new Error(`Failed to start disk creation process: ${err.message}`));
    });

    proc.on('close', (code) => {
      console.log(`[Disk Creation ${vmName}] Process exited with code ${code}`);
      console.log(`[Disk Creation ${vmName}] stdout: "${output.trim()}"`);
      console.log(`[Disk Creation ${vmName}] stderr: "${errors.trim()}"`);
      
      if (code === 0 && output.includes('SUCCESS')) {
        setProgress(vmName, {
          stage: 'Creating disk image',
          message: 'Disk image created',
          percent: 100
        });
        resolve(true);
      } else {
        clearProgress(vmName);
        // Build comprehensive error message
        let errorMsg = '';
        if (errors.trim()) {
          errorMsg = errors.trim();
        } else if (output.trim()) {
          errorMsg = output.trim();
        } else {
          errorMsg = `Process exited with code ${code} (no output captured)`;
        }
        const fullError = `Failed to create disk: ${errorMsg}`;
        console.error(`[Disk Creation ${vmName}]`, fullError);
        reject(new Error(fullError));
      }
    });
  });
}

/**
 * Download Windows ISO with progress tracking
 */
async function downloadWindowsISO(vmName = 'shared') {
  return new Promise((resolve, reject) => {
    const python = require('./python-bridge').getPythonExecutable();
    const script = `
import sys
import json
import subprocess
import os
import time
from pathlib import Path
sys.path.insert(0, '${REPO_ROOT}')
from vm_operations import VMOperations

ops = VMOperations('${REPO_ROOT}')
iso_path = ops.shared_dir / "win11-arm64.iso"

# Check if already exists
if iso_path.exists():
    from vm_operations import VMOperations
    if ops._verify_iso_checksum(iso_path):
        print(json.dumps({"status": "complete", "percent": 100}))
        sys.exit(0)

# Get file size from URL
import urllib.request
try:
    with urllib.request.urlopen(ops.windows_iso_url) as response:
        total_size = int(response.headers.get('Content-Length', 0))
except:
    total_size = 0

# Download with progress using Python urllib
try:
    import urllib.request
    import time
    
    # Use a list to hold mutable state for the progress hook
    progress_state = {
        'start_time': time.time(),
        'last_update': time.time(),
        'last_downloaded': 0
    }
    
    def progress_hook(count, block_size, total_size):
        current_time = time.time()
        
        if total_size > 0:
            downloaded = count * block_size
            percent = min((downloaded * 100) / total_size, 99.9)
            
            # Calculate speed (bytes per second)
            time_diff = current_time - progress_state['last_update']
            if time_diff >= 1.0:  # Update every second
                downloaded_diff = downloaded - progress_state['last_downloaded']
                speed = downloaded_diff / time_diff if time_diff > 0 else 0
                progress_state['last_update'] = current_time
                progress_state['last_downloaded'] = downloaded
                
                # Calculate ETA
                if speed > 0:
                    remaining = total_size - downloaded
                    eta_seconds = remaining / speed
                    if eta_seconds < 60:
                        eta_str = f"{int(eta_seconds)}s"
                    elif eta_seconds < 3600:
                        eta_str = f"{int(eta_seconds // 60)}m {int(eta_seconds % 60)}s"
                    else:
                        eta_str = f"{int(eta_seconds // 3600)}h {int((eta_seconds % 3600) // 60)}m"
                else:
                    eta_str = "calculating..."
                
                progress_data = {
                    "status": "downloading",
                    "percent": percent,
                    "downloaded": downloaded,
                    "total": total_size,
                    "speed": speed,
                    "eta": eta_str
                }
                print(json.dumps(progress_data), flush=True)
    
    # Download the file (this will raise an exception on error)
    urllib.request.urlretrieve(ops.windows_iso_url, str(iso_path), progress_hook)
    
    # Final progress
    print(json.dumps({"status": "downloading", "percent": 100, "downloaded": total_size, "total": total_size, "speed": 0, "eta": "0s"}), flush=True)
    
    # Verify checksum
    if ops._verify_iso_checksum(iso_path):
        print(json.dumps({"status": "complete", "percent": 100}))
        sys.exit(0)
    else:
        print(json.dumps({"status": "error", "message": "Checksum verification failed"}))
        if iso_path.exists():
            iso_path.unlink()
        sys.exit(1)
        
except Exception as e:
    print(json.dumps({"status": "error", "message": str(e)}))
    sys.exit(1)
`;

    // Use unbuffered Python output for real-time logging
    const proc = spawn(python, ['-u', '-c', script], { 
      cwd: REPO_ROOT,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });
    let lastProgress = { percent: 0, status: 'starting' };
    let stderrOutput = '';

    proc.stdout.on('data', (data) => {
      const output = data.toString();
      // Log all stdout to console
      console.log(`[ISO Download ${vmName}]`, output);
      
      const lines = output.split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const progress = JSON.parse(line);
          lastProgress = progress;
          
          if (progress.status === 'downloading') {
            setProgress(vmName, {
              stage: 'Downloading Windows ISO',
              message: `Downloading: ${progress.percent.toFixed(1)}%`,
              percent: progress.percent,
              details: `Speed: ${formatBytes(progress.speed)}/s | ETA: ${progress.eta}`
            });
          } else if (progress.status === 'complete') {
            setProgress(vmName, {
              stage: 'Downloading Windows ISO',
              message: 'Download complete. Starting ISO preparation...',
              percent: 100
            });
            // Don't clear progress - let prepareISO take over
          } else if (progress.status === 'error') {
            // Error occurred during download
            lastProgress = progress;
            setProgress(vmName, {
              stage: 'Downloading Windows ISO',
              message: `Error: ${progress.message || 'Download failed'}`,
              percent: progress.percent || 0
            });
          }
        } catch (e) {
          // Log non-JSON lines to console for debugging
          if (line && !line.includes('PROGRESS:')) {
            console.log(`[ISO Download ${vmName} RAW]`, line);
          }
        }
      }
    });

    proc.stderr.on('data', (data) => {
      // Collect stderr output for error reporting
      const errorText = data.toString();
      stderrOutput += errorText;
      // Log all stderr to console
      console.error(`[ISO Download ${vmName}]`, errorText);
    });

    proc.on('close', (code) => {
      console.log(`[ISO Download ${vmName}] Process exited with code ${code}`);
      if (stderrOutput) {
        console.error(`[ISO Download ${vmName}] Full stderr:`, stderrOutput);
      }
      
      // Check if we got a complete status before checking exit code
      if (lastProgress.status === 'complete') {
        resolve(true);
      } else if (code === 0 && lastProgress.status === 'downloading' && lastProgress.percent >= 99) {
        // Download finished but didn't get complete status - check if file exists
        resolve(true);
      } else {
        clearProgress(vmName);
        // Use error message from progress if available, otherwise from stderr
        let errorMsg = lastProgress.message || `Download failed with exit code ${code}`;
        if (stderrOutput && !lastProgress.message) {
          // Extract error from stderr if no message in progress
          const errorMatch = stderrOutput.match(/(?:Error|Exception|Traceback)[^\n]*/);
          if (errorMatch) {
            errorMsg = errorMatch[0].substring(0, 200); // Limit length
          } else {
            errorMsg = stderrOutput.substring(0, 500); // Use full stderr if no match
          }
        }
        const fullError = `Failed to download ISO: ${errorMsg}\n\nFull stderr:\n${stderrOutput}`;
        console.error(`[ISO Download ${vmName}]`, fullError);
        reject(new Error(fullError));
      }
    });
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Prepare ISO for VM (with progress tracking)
 */
async function prepareISOForVM(vmName, sudoPassword = null) {
  // Set initial progress to show we're starting ISO preparation
  setProgress(vmName, {
    stage: 'Preparing ISO',
    message: 'Starting ISO preparation...',
    percent: 0
  });
  
  return new Promise((resolve, reject) => {
    const python = require('./python-bridge').getPythonExecutable();
    
    // Encode sudo password for safe passing
    const sudoPasswordB64 = sudoPassword ? Buffer.from(sudoPassword).toString('base64') : '';
    
    const script = `
import sys
import json
import base64
sys.path.insert(0, '${REPO_ROOT}')
from vm_operations import VMOperations

def progress(msg):
    print(json.dumps({"type": "progress", "message": msg}), flush=True)

ops = VMOperations('${REPO_ROOT}')
${sudoPasswordB64 ? `ops.set_sudo_password(base64.b64decode('${sudoPasswordB64}').decode('utf-8'))` : ''}
result = ops.prepare_iso_for_vm('${vmName}', progress)
print(json.dumps({"type": "result", "success": result}))
`;

    // Use unbuffered Python output for real-time logging
    const proc = spawn(python, ['-u', '-c', script], { 
      cwd: REPO_ROOT,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });
    let allOutput = '';
    let allErrors = '';
    const stages = [
      'Extracting ISO',
      'Downloading VirtIO drivers',
      'Preparing drivers',
      'Injecting drivers into boot.wim',
      'Copying drivers to WinPE directory',
      'Copying drivers to OEM directory',
      'Injecting autounattend.xml',
      'Rebuilding ISO'
    ];
    let currentStage = 0;

    let completed = false;
    
    proc.stdout.on('data', (data) => {
      const output = data.toString();
      allOutput += output;
      // Log all output to console
      console.log(`[ISO Prep ${vmName}]`, output);
      
      const lines = output.split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.type === 'progress') {
            const message = data.message.toLowerCase();
            
            // Map progress messages to stages
            if ('extract' in message) {
              currentStage = 0;
            } else if ('download' in message && 'driver' in message) {
              currentStage = 1;
            } else if ('preparing' in message || 'prepare' in message) {
              currentStage = 2;
            } else if ('inject' in message && 'boot.wim' in message) {
              currentStage = 3;
            } else if ('winpe' in message || 'winpedriver' in message) {
              currentStage = 4;
            } else if ('oem' in message) {
              currentStage = 5;
            } else if ('autounattend' in message) {
              currentStage = 6;
            } else if ('rebuild' in message || 'iso' in message) {
              currentStage = 7;
            }
            
            const percent = ((currentStage + 1) / stages.length) * 100;
            setProgress(vmName, {
              stage: stages[currentStage],
              message: data.message,
              percent: Math.min(percent, 95)
            });
          } else if (data.type === 'result') {
            if (data.success) {
              setProgress(vmName, {
                stage: 'Ready',
                message: 'VM is ready to start',
                percent: 100
              });
              completed = true;
            } else {
              setProgress(vmName, {
                stage: 'Error',
                message: 'ISO preparation failed',
                percent: 0
              });
              completed = true; // Mark as completed even on failure
            }
          }
        } catch (e) {
          // Try to parse as plain progress message
          if (line.includes('PROGRESS:')) {
            const message = line.substring(9);
            setProgress(vmName, {
              stage: stages[currentStage] || 'Preparing ISO',
              message: message,
              percent: ((currentStage + 1) / stages.length) * 100
            });
          }
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const error = data.toString();
      allErrors += error;
      // Log all errors to console
      console.error(`[ISO Prep ${vmName} ERROR]`, error);
      
      // Progress messages might go to stderr
      const text = error;
      if (text.includes('PROGRESS:')) {
        const message = text.substring(text.indexOf('PROGRESS:') + 9).trim();
        setProgress(vmName, {
          stage: stages[currentStage] || 'Preparing ISO',
          message: message,
          percent: ((currentStage + 1) / stages.length) * 100
        });
      }
    });

    proc.on('close', (code) => {
      // Log final status
      console.log(`[ISO Prep ${vmName}] Process exited with code ${code}`);
      if (allOutput) {
        console.log(`[ISO Prep ${vmName}] Full stdout:`, allOutput);
      }
      if (allErrors) {
        console.error(`[ISO Prep ${vmName}] Full stderr:`, allErrors);
      }
      
      if (code === 0 && completed) {
        resolve(true);
      } else if (code === 0 && !completed) {
        // Process exited but we didn't get a result - might still be success
        console.warn(`[ISO Prep ${vmName}] Process completed but no result received`);
        resolve(true);
      } else {
        clearProgress(vmName);
        const errorMsg = `Failed to prepare ISO: process exited with code ${code}\n\nOutput:\n${allOutput}\n\nErrors:\n${allErrors}`;
        console.error(`[ISO Prep ${vmName}]`, errorMsg);
        reject(new Error(errorMsg));
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

    // Use unbuffered Python output for real-time logging
    const proc = spawn(python, ['-u', '-c', script], { 
      cwd: REPO_ROOT,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });
    let output = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log(`[VM Start ${vmName}]`, text);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.error(`[VM Start ${vmName} ERROR]`, text);
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

    // Use unbuffered Python output for real-time logging
    const proc = spawn(python, ['-u', '-c', script], { 
      cwd: REPO_ROOT,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });
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
/**
 * Check if VM desktop is ready
 */
async function checkDesktopReady(vmName) {
  return new Promise((resolve, reject) => {
    const python = require('./python-bridge').getPythonExecutable();
    const script = `
import sys
import json
sys.path.insert(0, '${REPO_ROOT}')
from qga_client import check_vm_desktop_ready

try:
    result = check_vm_desktop_ready('${vmName}', '${REPO_ROOT}')
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({"ready": False, "error": str(e), "details": "Failed to check desktop ready"}))
`;

    // Use unbuffered Python output for real-time logging
    const proc = spawn(python, ['-u', '-c', script], { 
      cwd: REPO_ROOT,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });
    let output = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      // Log errors but don't fail
      console.warn('QGA check stderr:', data.toString());
    });

    proc.on('close', (code) => {
      try {
        const result = JSON.parse(output.trim());
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse desktop-ready result: ${output}`));
      }
    });
  });
}

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

    // Use unbuffered Python output for real-time logging
    const proc = spawn(python, ['-u', '-c', script], { 
      cwd: REPO_ROOT,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });
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
  startWebsockify,
  checkDesktopReady
};

