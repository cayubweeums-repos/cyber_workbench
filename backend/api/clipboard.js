const path = require('path');
const { getSshPort, getHostGatewayIp, createSSHConnection } = require('../utils/ssh');
const { loadVmConfig, STORAGE_BASE } = require('../utils/config');

/**
 * Get clipboard content from VM
 */
async function getClipboard(req, res) {
  const { containerName } = req.params;
  
  try {
    const vmId = containerName;
    const storagePath = path.join(STORAGE_BASE, vmId);
    const config = loadVmConfig(storagePath);
    
    const hostIp = await getHostGatewayIp();
    const sshPort = await getSshPort(containerName);
    const conn = await createSSHConnection(hostIp, sshPort, config.username, config.password);
    
    conn.exec('powershell.exe -Command "Get-Clipboard"', (err, stream) => {
      if (err) {
        conn.end();
        return res.status(500).json({ success: false, error: err.message });
      }
      
      let output = '';
      stream.on('data', (data) => {
        output += data.toString();
      });
      
      stream.on('end', () => {
        conn.end();
        res.json({ success: true, content: output.trim() });
      });
      
      stream.on('error', (err) => {
        conn.end();
        res.status(500).json({ success: false, error: err.message });
      });
    });
  } catch (error) {
    console.error('Error getting clipboard:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Set clipboard content in VM
 */
async function setClipboard(req, res) {
  const { containerName } = req.params;
  const { content } = req.body;
  
  if (!content) {
    return res.status(400).json({ success: false, error: 'Content is required' });
  }
  
  try {
    const vmId = containerName;
    const storagePath = path.join(STORAGE_BASE, vmId);
    const config = loadVmConfig(storagePath);
    
    const hostIp = await getHostGatewayIp();
    const sshPort = await getSshPort(containerName);
    const conn = await createSSHConnection(hostIp, sshPort, config.username, config.password);
    
    // Escape content for PowerShell
    const escapedContent = content.replace(/"/g, '`"').replace(/\$/g, '`$');
    const command = `powershell.exe -Command "Set-Clipboard -Value \\"${escapedContent}\\""`;
    
    conn.exec(command, (err, stream) => {
      if (err) {
        conn.end();
        return res.status(500).json({ success: false, error: err.message });
      }
      
      stream.on('end', () => {
        conn.end();
        res.json({ success: true });
      });
      
      stream.on('error', (err) => {
        conn.end();
        res.status(500).json({ success: false, error: err.message });
      });
      
      stream.resume();
    });
  } catch (error) {
    console.error('Error setting clipboard:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  getClipboard,
  setClipboard
};

