const path = require('path');
const fs = require('fs');
const { getSshPort, getHostGatewayIp, createSSHConnection } = require('../utils/ssh');
const { loadVmConfig, STORAGE_BASE } = require('../utils/config');

/**
 * List directory via SFTP
 */
async function listDirectory(containerName, remotePath, username, password) {
  const hostIp = await getHostGatewayIp();
  const sshPort = await getSshPort(containerName);
  console.log(`Connecting to ${hostIp}:${sshPort} for SFTP...`);
  const conn = await createSSHConnection(hostIp, sshPort, username, password);
  
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) {
        conn.end();
        return reject(err);
      }
      
      sftp.readdir(remotePath, (err, list) => {
        conn.end();
        if (err) return reject(err);
        
        const files = list.map(item => ({
          name: item.filename,
          type: item.attrs.isDirectory() ? 'directory' : 'file',
          size: item.attrs.size,
          modified: item.attrs.mtime * 1000
        }));
        
        resolve(files);
      });
    });
  });
}

/**
 * Download file via SFTP
 */
async function downloadFileFromVM(containerName, remotePath, username, password) {
  const hostIp = await getHostGatewayIp();
  const sshPort = await getSshPort(containerName);
  const conn = await createSSHConnection(hostIp, sshPort, username, password);
  
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) {
        conn.end();
        return reject(err);
      }
      
      const readStream = sftp.createReadStream(remotePath);
      const chunks = [];
      
      readStream.on('data', chunk => chunks.push(chunk));
      readStream.on('end', () => {
        conn.end();
        resolve(Buffer.concat(chunks));
      });
      readStream.on('error', err => {
        conn.end();
        reject(err);
      });
    });
  });
}

/**
 * Upload file via SFTP
 */
async function uploadFileToVM(containerName, localPath, remotePath, username, password) {
  const hostIp = await getHostGatewayIp();
  const sshPort = await getSshPort(containerName);
  const conn = await createSSHConnection(hostIp, sshPort, username, password);
  
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) {
        conn.end();
        return reject(err);
      }
      
      sftp.fastPut(localPath, remotePath, (err) => {
        conn.end();
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

/**
 * Delete file/directory via SFTP
 */
async function deleteFileFromVM(containerName, remotePath, username, password) {
  const hostIp = await getHostGatewayIp();
  const sshPort = await getSshPort(containerName);
  const conn = await createSSHConnection(hostIp, sshPort, username, password);
  
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) {
        conn.end();
        return reject(err);
      }
      
      sftp.stat(remotePath, (err, stats) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        
        if (stats.isDirectory()) {
          sftp.rmdir(remotePath, (err) => {
            conn.end();
            if (err) return reject(err);
            resolve();
          });
        } else {
          sftp.unlink(remotePath, (err) => {
            conn.end();
            if (err) return reject(err);
            resolve();
          });
        }
      });
    });
  });
}

/**
 * API: Browse files
 */
async function browseFiles(req, res) {
  const { containerName } = req.params;
  const remotePath = req.query.path || 'C:\\';
  
  try {
    const vmId = containerName;
    const storagePath = path.join(STORAGE_BASE, vmId);
    const config = loadVmConfig(storagePath);
    
    const files = await listDirectory(containerName, remotePath, config.username, config.password);
    res.json({ success: true, files });
  } catch (error) {
    console.error('Error browsing files:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * API: Download file
 */
async function downloadFile(req, res) {
  const { containerName } = req.params;
  const remotePath = req.query.path;
  
  if (!remotePath) {
    return res.status(400).json({ success: false, error: 'Path is required' });
  }
  
  try {
    const vmId = containerName;
    const storagePath = path.join(STORAGE_BASE, vmId);
    const config = loadVmConfig(storagePath);
    
    const fileData = await downloadFileFromVM(containerName, remotePath, config.username, config.password);
    const filename = path.basename(remotePath);
    
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.set('Content-Type', 'application/octet-stream');
    res.send(fileData);
  } catch (error) {
    console.error('Error downloading file:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * API: Upload file
 */
async function uploadFile(req, res) {
  const { containerName } = req.params;
  const remotePath = req.body.path || 'C:\\';
  
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }
  
  try {
    const vmId = containerName;
    const storagePath = path.join(STORAGE_BASE, vmId);
    const config = loadVmConfig(storagePath);
    
    const remoteFilePath = path.join(remotePath, req.file.originalname).replace(/\\/g, '\\');
    await uploadFileToVM(containerName, req.file.path, remoteFilePath, config.username, config.password);
    
    // Clean up temp file
    fs.unlinkSync(req.file.path);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error uploading file:', error.message);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * API: Delete file
 */
async function deleteFile(req, res) {
  const { containerName } = req.params;
  const remotePath = req.query.path;
  
  if (!remotePath) {
    return res.status(400).json({ success: false, error: 'Path is required' });
  }
  
  try {
    const vmId = containerName;
    const storagePath = path.join(STORAGE_BASE, vmId);
    const config = loadVmConfig(storagePath);
    
    await deleteFileFromVM(containerName, remotePath, config.username, config.password);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  browseFiles,
  downloadFile,
  uploadFile,
  deleteFile
};

