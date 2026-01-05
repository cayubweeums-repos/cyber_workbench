const path = require('path');
const { getContainer, createContainer, getImage, listWindowsContainers } = require('../utils/docker');
const { getVmStoragePath, saveVmConfig, loadVmConfig, STORAGE_BASE, loadTemplateMetadata, loadCloneMetadata, saveCloneMetadata } = require('../utils/config');
const { parseAndInjectScripts } = require('../utils/xml');
const { checkCanCreateVM } = require('../utils/limits');
const { createLifecycleLabels, extendVMTime, getLifecycleMetadata } = require('../utils/lifecycle');
const { formatVolumeBind } = require('../utils/volume');
const { incrementStarts, incrementStops } = require('../utils/metrics');
const { ensureDefaultVmNetwork, removeDefaultVmNetwork, removeLegacySandboxNetwork, getDefaultVmNetworkName } = require('../utils/network');
const { inspectNetwork, connectContainerToNetwork } = require('../utils/docker-networks');
const { callQmpApi } = require('../utils/template');
const { getAllMappedPortsFromInspect } = require('../utils/ports');
const fs = require('fs');

function isDockerNotFoundError(error) {
  // dockerode typically sets `statusCode`, but some paths only include the message.
  return error && (error.statusCode === 404 || /no such container/i.test(error.message || ''));
}

// Legacy hook: desktop readiness is computed live in `/api/status` (no persistent cache).
// Keep as a no-op so delete remains safe even if older code paths still call it.
function clearDesktopReady(_containerName) {}

/**
 * List all VMs
 */
async function listVMs(req, res) {
  try {
    if (!fs.existsSync(STORAGE_BASE)) {
      return res.json([]);
    }

    // Running containers (Docker) - used to mark runtime state in the VM listing
    const runningContainers = await listWindowsContainers({ all: false });
    const runningSet = new Set(
      runningContainers
        .map(c => c.Names?.[0]?.replace('/', ''))
        .filter(Boolean)
    );
    
    const dirs = fs.readdirSync(STORAGE_BASE, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    const vms = dirs.map(dirName => {
      const parts = dirName.split('_');
      const osType = parts[0];
      const vmName = parts.slice(1).join('_');
      const storagePath = path.join(STORAGE_BASE, dirName);
      
      const config = loadVmConfig(storagePath);
      
      // Ensure config.txt exists
      const configPath = path.join(storagePath, 'config.txt');
      if (!fs.existsSync(configPath)) {
        try {
          saveVmConfig(storagePath, config);
          console.log(`Created missing config.txt for ${dirName}`);
        } catch (e) {
          console.warn(`Could not create config.txt for ${dirName}:`, e.message);
        }
      }
      
      // Check if disk exists
      const diskPath = path.join(storagePath, 'data.qcow2');
      const hasData = fs.existsSync(diskPath);
      
      return {
        id: dirName,
        osType,
        name: vmName,
        ram: config.ram,
        cpu: config.cpu,
        hasData,
        running: runningSet.has(dirName),
        endpoints: {
          status: `/api/status/${encodeURIComponent(dirName)}`,
          viewers: `/api/vm/${encodeURIComponent(dirName)}/viewers`,
        },
      };
    });
    
    res.json(vms);
  } catch (error) {
    console.error('Error listing VMs:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Start a Windows VM
 */
async function startVM(req, res, buildState) {
  const body = req.body || {};

  // Backwards compatible payload:
  // - Legacy UI sends { version, vmName, ... }
  // - New API-friendly form can send { osType: "win11", name: "dev", ... }
  let version = body.version ?? '11';
  const vmName = body.vmName ?? body.name ?? 'default';

  if (body.osType) {
    const m = String(body.osType).match(/^win(\d+)$/);
    if (!m) {
      return res.status(400).json({ success: false, error: `Invalid osType: ${body.osType} (expected win7|win8|win10|win11)` });
    }
    const fromOsType = m[1];
    if (body.version && String(body.version) !== fromOsType) {
      return res.status(400).json({ success: false, error: 'Provide either osType or version (or ensure they match)' });
    }
    version = fromOsType;
  }

  const ram = body.ram ?? '8G';
  const cpu = body.cpu ?? '4';
  const username = body.username ?? 'user';
  const password = body.password ?? 'password';
  const timeLimit = body.timeLimit ?? null;
  const persistent = body.persistent ?? false;
  const advancedScripts = body.advancedScripts ?? null;
  const networks = body.networks ?? undefined;
  const useDefaultNetwork = body.useDefaultNetwork !== false; // default: true (safe isolation)
  
  const osType = `win${version}`;
  const vmId = `${osType}_${vmName}`;
  
  const vmType = persistent ? 'PERSISTENT' : 'TIMED';
  console.log(`Starting VM: ${vmId} (RAM: ${ram}, CPU: ${cpu}, Type: ${vmType})`);
  
  try {
    // Create storage path and save config
    const storagePath = getVmStoragePath(osType, vmName);
    
    // Check if this is a template - templates cannot be started
    const templateMetadata = loadTemplateMetadata(storagePath);
    if (templateMetadata && templateMetadata.isTemplate) {
      return res.status(400).json({
        success: false,
        error: 'Cannot start template VMs. Create a clone instead.'
      });
    }
    
    // Check resource limits before starting
    const limitCheck = await checkCanCreateVM(ram, cpu);
    if (!limitCheck.allowed) {
      return res.status(400).json({ 
        success: false, 
        error: limitCheck.reason 
      });
    }
    
    saveVmConfig(storagePath, { ram, cpu, username, password });
    
    // Get the HOST path for volume mounting
    const hostStoragePath = path.join(process.env.STORAGE_BASE || '/app/storage/vms', vmId);
    console.log(`Host storage path: ${hostStoragePath}`);
    
    // Process advanced scripts if provided
    if (advancedScripts && Object.keys(advancedScripts).some(key => advancedScripts[key]?.length > 0)) {
      console.log('Processing advanced installation scripts...');
      await parseAndInjectScripts(version, hostStoragePath, advancedScripts);
    } else {
      await parseAndInjectScripts(version, hostStoragePath, null);
    }
    
    // Check if image is ready
    const imageName = 'dockurr/windows:custom';
    
    if (!buildState.isReady) {
      throw new Error('Windows image is not ready yet. Please wait for the build to complete.');
    }
    
    try {
      await getImage(imageName).inspect();
      console.log('Image verified, proceeding with container creation');
    } catch (e) {
      throw new Error('Windows image not found. Please restart the VM Manager.');
    }
    
    // NOTE: Concurrency support - do NOT stop/remove other Windows VMs here.
    // Each VM is isolated by container name and dynamic port mappings.
    
    // Configure volumes with SELinux using utility
    const recordingsPath = process.env.RECORDINGS_PATH || '/app/storage/recordings';
    
    console.log(`Recordings path: ${recordingsPath}`);
    
    // Create lifecycle labels (persistent VMs have no time limit)
    const lifecycleLabels = createLifecycleLabels(timeLimit, persistent);

    // Networking:
    // - If `networks` is omitted: create a dedicated per-VM bridge network (isolated by default).
    // - If `networks` is provided: first entry is treated as primary (NetworkMode), remaining are connected after start.
    let primaryNetworkName = null;
    let primaryEndpointConfig = {};
    const extraNetworkSpecs = [];

    if (networks === undefined || networks === null) {
      const allowInternet = process.env.VM_ALLOW_INTERNET !== 'false'; // Default: true
      await ensureDefaultVmNetwork(vmId, { internetEgress: allowInternet });
      primaryNetworkName = getDefaultVmNetworkName(vmId);
      console.log(`VM ${vmId} default network: ${primaryNetworkName} (internetEgress: ${allowInternet})`);
    } else if (Array.isArray(networks)) {
      if (useDefaultNetwork) {
        // Safe default: always create a per-VM primary network, and treat `networks[]` as *additional* attachments.
        const allowInternet = process.env.VM_ALLOW_INTERNET !== 'false'; // Default: true
        await ensureDefaultVmNetwork(vmId, { internetEgress: allowInternet });
        primaryNetworkName = getDefaultVmNetworkName(vmId);
        console.log(`VM ${vmId} default network: ${primaryNetworkName} (internetEgress: ${allowInternet})`);

        for (const spec of networks) {
          if (!spec) continue;
          const ref = spec.name || spec.idOrName || spec.id;
          if (!ref) {
            return res.status(400).json({ success: false, error: 'networks entries must include name (or idOrName)' });
          }
          extraNetworkSpecs.push(spec);
        }
      } else {
        // Advanced mode: treat the first entry as primary.
        if (networks.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'networks cannot be an empty array when useDefaultNetwork=false (a primary network is required)',
          });
        }

        const primarySpec = networks[0] || {};
        const primaryRef = primarySpec.name || primarySpec.idOrName || primarySpec.id;
        if (!primaryRef) {
          return res.status(400).json({ success: false, error: 'networks[0] must include a network name (or idOrName)' });
        }

        const primaryInspect = await inspectNetwork(primaryRef);
        primaryNetworkName = primaryInspect.info?.Name;
        if (!primaryNetworkName) {
          return res.status(400).json({ success: false, error: `Failed to resolve primary network: ${primaryRef}` });
        }

        // Optional primary endpoint config
        if (Array.isArray(primarySpec.aliases) && primarySpec.aliases.length > 0) {
          primaryEndpointConfig.Aliases = primarySpec.aliases.filter(Boolean);
        }
        if (primarySpec.ipv4Address || primarySpec.ipv6Address) {
          primaryEndpointConfig.IPAMConfig = {};
          if (primarySpec.ipv4Address) primaryEndpointConfig.IPAMConfig.IPv4Address = primarySpec.ipv4Address;
          if (primarySpec.ipv6Address) primaryEndpointConfig.IPAMConfig.IPv6Address = primarySpec.ipv6Address;
        }

        for (const spec of networks.slice(1)) {
          if (!spec) continue;
          const ref = spec.name || spec.idOrName || spec.id;
          if (!ref) {
            return res.status(400).json({ success: false, error: 'networks entries must include name (or idOrName)' });
          }
          extraNetworkSpecs.push(spec);
        }
      }
    } else {
      return res.status(400).json({ success: false, error: 'networks must be an array of network specs when provided' });
    }
    
    // Start container with custom resources
    const container = await createContainer({
      Image: imageName,
      name: vmId,
      Labels: {
        ...lifecycleLabels,
        'vapiorc.ram': ram,
        'vapiorc.cpu': cpu,
      },
      Env: [
        `VERSION=${version}`,
        'DISK_FMT=qcow2',
        'QGA_ENABLE=Y',
        'QMP_ENABLE=Y',
        'GUACAMOLE_ENABLE=Y',
        'USER_PORTS=22',
        `USERNAME=${username}`,
        `PASSWORD=${password}`,
        `RAM_SIZE=${ram}`,
        `CPU_CORES=${cpu}`,
        `CONTAINER_NAME=${vmId}`,
        'RECORDING_ENABLED=true',
        'RECORDING_SEARCH_PATH=/recordings',
      ],
      ExposedPorts: {
        '22/tcp': {},
        '3389/tcp': {},
        '3389/udp': {},
        '8006/tcp': {},
      },
      HostConfig: {
        Devices: [
          { PathOnHost: '/dev/kvm', PathInContainer: '/dev/kvm', CgroupPermissions: 'rwm' },
          { PathOnHost: '/dev/net/tun', PathInContainer: '/dev/net/tun', CgroupPermissions: 'rwm' },
        ],
        CapAdd: ['NET_ADMIN'],
        PortBindings: {
          // Dynamic host port assignment (collision-free for concurrent VMs)
          // Container-internal ports are stable; only host ports are dynamic.
          '8006/tcp': [{ HostPort: '' }],  // noVNC + Guacamole (via nginx inside the VM container)
          '3389/tcp': [{ HostPort: '' }],  // optional direct RDP access
          '3389/udp': [{ HostPort: '' }],  // optional direct RDP UDP
          '22/tcp': [{ HostPort: '' }],
        },
        Binds: [ // formatVolumeBind handles SELinux :z flag
          formatVolumeBind(hostStoragePath, '/storage'),
          formatVolumeBind(recordingsPath, '/recordings')
        ],
        NetworkMode: primaryNetworkName,
        RestartPolicy: { Name: 'unless-stopped' },
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [primaryNetworkName]: primaryEndpointConfig,
        },
      },
    });
    
    await container.start();
    console.log(`VM ${vmId} started successfully (primary network: ${primaryNetworkName})`);

    // Capture port mappings early so API consumers can immediately discover viewers/SSH/etc.
    const startedInspect = await container.inspect();
    const mappedPorts = getAllMappedPortsFromInspect(startedInspect);

    // Connect any additional networks requested by the user (secondary networks).
    for (const spec of extraNetworkSpecs) {
      const ref = spec.name || spec.idOrName || spec.id;
      await connectContainerToNetwork(vmId, ref, {
        aliases: spec.aliases,
        ipv4Address: spec.ipv4Address,
        ipv6Address: spec.ipv6Address,
      });
      console.log(`VM ${vmId} connected to additional network: ${ref}`);
    }
    
    // Track metrics
    incrementStarts(osType, vmName);
    
    res.json({
      success: true,
      vmId,
      ports: mappedPorts,
      networks: Object.keys((await container.inspect()).NetworkSettings?.Networks || {}),
      primaryNetwork: primaryNetworkName,
      endpoints: {
        status: `/api/status/${encodeURIComponent(vmId)}`,
        viewers: `/api/vm/${encodeURIComponent(vmId)}/viewers`,
      },
    });
  } catch (error) {
    console.error('Error starting VM:', error.message);
    // Best-effort cleanup: remove any auto-created per-VM networks (only if unused).
    try {
      await removeDefaultVmNetwork(vmId);
      await removeLegacySandboxNetwork(vmId);
    } catch (_) {}
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Stop a VM
 */
async function stopVM(req, res) {
  const { containerName } = req.params;
  
  try {
    console.log(`Stopping container: ${containerName}`);
    
    // Extract OS type and VM name for metrics
    const parts = containerName.split('_');
    const osType = parts[0];
    const vmName = parts.slice(1).join('_');
    
    const container = getContainer(containerName);
    await container.stop();
    await container.remove();
    console.log(`Container ${containerName} stopped and removed`);
    
    // Remove per-VM networks (best-effort; only auto-created default networks are eligible)
    await removeDefaultVmNetwork(containerName);
    await removeLegacySandboxNetwork(containerName);
    
    // Track metrics
    incrementStops(osType, vmName);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error stopping VM:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Restart a VM
 */
async function restartVM(req, res) {
  const { containerName } = req.params;
  
  try {
    console.log(`Restarting container: ${containerName}`);
    
    const container = getContainer(containerName);
    await container.restart();
    console.log(`Container ${containerName} restarted`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error restarting VM:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Extend VM time limit
 */
async function extendVM(req, res) {
  const { containerName } = req.params;
  const { additionalSeconds } = req.body;
  
  if (!additionalSeconds || additionalSeconds <= 0) {
    return res.status(400).json({ 
      success: false, 
      error: 'additionalSeconds must be a positive number' 
    });
  }
  
  try {
    const result = await extendVMTime(containerName, additionalSeconds);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error extending VM time:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Delete a VM (stop container, remove storage)
 */
async function deleteVM(req, res) {
  const { containerName } = req.params;
  
  try {
    console.log(`Deleting VM: ${containerName}`);
    
    // Extract OS type and VM name for metrics
    const parts = containerName.split('_');
    const osType = parts[0];
    const vmName = parts.slice(1).join('_');
    
    // Stop and remove container if running
    let containerWasMissing = false;
    try {
      const container = getContainer(containerName);
      const info = await container.inspect();
      
      if (info.State.Running) {
        console.log(`Stopping container: ${containerName}`);
        await container.stop();
      }
      
      await container.remove();
      console.log(`Container ${containerName} removed`);
    } catch (error) {
      if (isDockerNotFoundError(error)) {
        // Container might not exist, continue with storage deletion
        containerWasMissing = true;
        console.log(`Container not found or already removed: ${error.message}`);
      } else {
        throw error;
      }
    }
    
    // Remove isolated network (best-effort; VM may already be gone)
    try {
      await removeDefaultVmNetwork(containerName);
      await removeLegacySandboxNetwork(containerName);
    } catch (e) {
      console.warn(`Could not remove VM networks for ${containerName}: ${e.message}`);
    }
    
    // Clear desktop readiness state (even if container was already removed)
    clearDesktopReady(containerName);
    
    // Delete storage directory
    const storagePath = getVmStoragePath(osType, vmName);
    let storageWasMissing = false;
    
    if (fs.existsSync(storagePath)) {
      console.log(`Deleting storage directory: ${storagePath}`);
      fs.rmSync(storagePath, { recursive: true, force: true });
      console.log(`Storage deleted: ${storagePath}`);
    } else {
      storageWasMissing = true;
      console.log(`Storage directory not found: ${storagePath}`);
    }
    
    // Track metrics
    incrementStops(osType, vmName);
    
    const messageParts = [];
    messageParts.push(`VM ${containerName} deleted successfully`);
    if (containerWasMissing) messageParts.push('(container already removed)');
    if (storageWasMissing) messageParts.push('(storage already removed)');
    
    res.json({ success: true, message: messageParts.join(' ') });
  } catch (error) {
    console.error('Error deleting VM:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  listVMs,
  startVM,
  stopVM,
  restartVM,
  extendVM,
  deleteVM
};

