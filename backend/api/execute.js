const path = require('path');
const { getSshPort, getHostGatewayIp, createSSHConnection, executeCommand } = require('../utils/ssh');
const { loadVmConfig, STORAGE_BASE } = require('../utils/config');

/**
 * Execute a command in the VM via SSH
 */
async function executeCommandInVM(req, res) {
  const { containerName } = req.params;
  const { command, shell = 'cmd' } = req.body;
  
  if (!command) {
    return res.status(400).json({ success: false, error: 'Command is required' });
  }
  
  try {
    const startTime = Date.now();
    const vmId = containerName;
    const storagePath = path.join(STORAGE_BASE, vmId);
    const config = loadVmConfig(storagePath);
    
    const hostIp = await getHostGatewayIp();
    const sshPort = await getSshPort(containerName);
    const conn = await createSSHConnection(hostIp, sshPort, config.username, config.password);
    
    // Build the command based on shell type
    let fullCommand;
    if (shell === 'powershell') {
      fullCommand = `powershell.exe -Command "${command.replace(/"/g, '\\"')}"`;
    } else {
      // Default to cmd
      fullCommand = `cmd.exe /c ${command}`;
    }
    
    const result = await executeCommand(conn, fullCommand);
    conn.end();
    
    const executionTime = Date.now() - startTime;
    
    res.json({
      success: true,
      output: result.output,
      error: result.error,
      exitCode: result.exitCode,
      executionTime
    });
  } catch (error) {
    console.error('Error executing command:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  executeCommandInVM
};

