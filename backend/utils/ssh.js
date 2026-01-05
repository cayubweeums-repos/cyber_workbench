const { Client: SSHClient } = require('ssh2');
const { getContainer, docker } = require('./docker');

/**
 * Get the dynamically assigned SSH port for a container
 */
async function getSshPort(containerName) {
  const container = getContainer(containerName);
  const info = await container.inspect();
  
  const portBindings = info.NetworkSettings.Ports['22/tcp'];
  if (portBindings && portBindings.length > 0) {
    return parseInt(portBindings[0].HostPort);
  }
  
  throw new Error(`No SSH port mapping found for ${containerName}`);
}

/**
 * Get host gateway IP from vm-manager's perspective
 */
async function getHostGatewayIp() {
  try {
    const { getVmManagerNetwork } = require('./docker');
    const network = await getVmManagerNetwork();
    return network.Gateway;
  } catch (e) {
    console.error('Error getting host gateway IP:', e.message);
    return '172.17.0.1'; // Fallback
  }
}

/**
 * Get default bridge gateway IP that Windows VMs can use to reach vm-manager
 * Windows VMs are on the default bridge network, so they use the bridge gateway
 */
async function getDefaultBridgeGateway() {
  try {
    const networks = await docker.listNetworks();
    const bridgeNetwork = networks.find(n => n.Name === 'bridge' || n.Driver === 'bridge');
    
    if (bridgeNetwork) {
      const network = docker.getNetwork(bridgeNetwork.Id);
      const inspect = await network.inspect();
      if (inspect.IPAM && inspect.IPAM.Config && inspect.IPAM.Config[0]) {
        const gateway = inspect.IPAM.Config[0].Gateway || '172.17.0.1';
        console.log(`[Network] Default bridge gateway: ${gateway}`);
        return gateway;
      }
    }
    
    // Fallback to typical Docker default bridge gateway
    return '172.17.0.1';
  } catch (e) {
    console.error('Error getting default bridge gateway:', e.message);
    return '172.17.0.1'; // Fallback
  }
}

/**
 * Create an SSH connection to a container
 */
function createSSHConnection(host, port, username, password) {
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    
    let connectionTimeout = setTimeout(() => {
      conn.end();
      reject(new Error('SSH connection timeout. OpenSSH Server may not be ready yet. Wait a few minutes for Windows to fully initialize.'));
    }, 30000); // 30 second timeout
    
    conn.on('ready', () => {
      clearTimeout(connectionTimeout);
      resolve(conn);
    })
      .on('error', (err) => {
        clearTimeout(connectionTimeout);
        // Provide more helpful error messages
        if (err.level === 'client-timeout') {
          reject(new Error('Connection timeout - OpenSSH may not be running yet'));
        } else if (err.code === 'ECONNREFUSED') {
          reject(new Error('Connection refused - OpenSSH Server not ready'));
        } else {
          reject(err);
        }
      })
      .connect({
        host,
        port,
        username,
        password,
        readyTimeout: 30000, // Increased from 10s to 30s
        keepaliveInterval: 5000,
        keepaliveCountMax: 3
      });
  });
}

/**
 * Execute a command via SSH and return output
 */
function executeCommand(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      
      let output = '';
      let errorOutput = '';
      
      stream.on('data', (data) => {
        output += data.toString();
      });
      
      stream.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      stream.on('close', (code) => {
        resolve({
          output: output.trim(),
          error: errorOutput.trim(),
          exitCode: code
        });
      });
      
      stream.on('error', reject);
    });
  });
}

module.exports = {
  getSshPort,
  getHostGatewayIp,
  getDefaultBridgeGateway,
  createSSHConnection,
  executeCommand
};

