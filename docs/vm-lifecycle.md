# VM Lifecycle

## VM States

```mermaid
stateDiagram-v2
    [*] --> Created: create()
    Created --> DiskCreated: createDisk()
    DiskCreated --> ISOReady: downloadISO() + prepareISO()
    ISOReady --> Starting: start()
    Starting --> Running: QEMU started
    Running --> Stopping: stop()
    Stopping --> Stopped: QEMU stopped
    Stopped --> Starting: start()
    Running --> [*]: delete()
    Stopped --> [*]: delete()
```

## VM Creation Workflow

```mermaid
graph TB
    Start[User Creates VM] --> Config[Create Config YAML]
    Config --> Disk[Create Disk Image]
    Disk --> Download{ISO Exists?}
    Download -->|No| DownloadISO[Download Windows ISO]
    Download -->|Yes| Prepare
    DownloadISO --> Prepare[Prepare ISO]
    Prepare --> Ready[VM Ready]
    Ready --> StartVM[User Starts VM]
    StartVM --> QEMU[QEMU Process]
    QEMU --> VNC[VNC Server :5900]
    VNC --> WebSockify[Websockify Proxy<br/>Port 6080-7079]
    WebSockify --> Nginx[nginx :8006]
    Nginx --> Browser[Browser noVNC]
    
    style Start fill:#dafc7b
    style Ready fill:#77874c
    style Browser fill:#dafc7b
    style Nginx fill:#77874c
```

## VM Start Sequence (Multi-VM Architecture)

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant API
    participant Tracker as VM Tracker
    participant Python
    participant QEMU
    participant WebSockify
    participant Nginx
    participant Browser
    
    User->>UI: Click Start
    UI->>API: POST /vms/:name/start
    API->>Python: start_vm()
    Python->>QEMU: qemu-system-aarch64
    QEMU-->>Python: Process started
    Python-->>API: Success
    API-->>UI: Success
    UI->>API: GET /vms/:name/viewer-port
    API->>Python: start_websockify()
    Python->>WebSockify: Start proxy (port 6080-7079)
    WebSockify-->>Python: Port number
    Python-->>API: Port
    API->>Tracker: registerVM(name, port)
    Tracker->>Nginx: startNginx() if first VM
    API->>Nginx: updateNginxConfigForVM()
    Nginx->>Nginx: Add route /websockify/{vmname}
    Nginx-->>API: Config updated
    API-->>UI: Port 8006 + path
    UI->>Browser: Load noVNC from nginx
    Browser->>Nginx: GET /vnc.html?path=/websockify/{vmname}
    Nginx->>Browser: noVNC files
    Browser->>Nginx: WebSocket upgrade /websockify/{vmname}
    Nginx->>WebSockify: Proxy to VM's websockify port
    WebSockify->>QEMU: VNC connection
    QEMU-->>WebSockify: Display data
    WebSockify-->>Nginx: WebSocket data
    Nginx-->>Browser: Render in noVNC
```

## Progress Tracking

```mermaid
graph LR
    Operation[VM Operation] --> Progress[Progress Store]
    Progress -->|Update| UI[UI Components]
    UI -->|Display| User[User]
    
    subgraph Progress Stages
        Disk[Creating Disk]
        Download[Downloading ISO]
        Prepare[Preparing ISO]
        Ready[Ready]
    end
    
    Operation --> Disk
    Disk --> Download
    Download --> Prepare
    Prepare --> Ready
```

## File System Structure

```mermaid
graph TB
    VMs[vms/] --> VM1[vm-name-1/]
    VMs --> VM2[vm-name-2/]
    VMs --> Shared[shared/]
    
    VM1 --> Config1[config.yaml]
    VM1 --> Disk1[windows.img]
    
    VM2 --> Config2[config.yaml]
    VM2 --> Disk2[windows.img]
    
    Shared --> ISO[win11-arm64.iso]
    Shared --> AutoUnattend[autounattend.xml]
    Shared --> Drivers[virtio drivers/]
```

