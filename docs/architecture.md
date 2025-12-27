# Architecture Overview

## System Architecture

```mermaid
graph TB
    Browser[Browser] -->|HTTP| Express[Express Server :3000]
    Browser -->|HTTP/WS| Express
    Express -->|Routes| API[API Layer]
    API -->|Subprocess| Python[Python Bridge]
    Python -->|Calls| VMManager[VMManager]
    Python -->|Calls| VMOps[VMOperations]
    Python -->|Calls| NetMgr[NetworkManager]
    VMOps -->|QEMU| QEMU1[QEMU VM1 :5900]
    VMOps -->|QEMU| QEMU2[QEMU VM2 :5900]
    VMOps -->|Websockify| WS1[Websockify VM1<br/>Port 6080-7079]
    VMOps -->|Websockify| WS2[Websockify VM2<br/>Port 6080-7079]
    WS1 -->|VNC| QEMU1
    WS2 -->|VNC| QEMU2
    Express -->|Proxy WS| WS1
    Express -->|Proxy WS| WS2
    Express -->|Serve| noVNC[noVNC Files]
    VMManager -->|YAML| Config[VM Configs]
    VMOps -->|qcow2| Disks[Disk Images]
    API -->|Track| Tracker[VM Tracker]
    NetMgr -->|ifconfig/ip| System[Host Networking]
```

## Layer Separation

```mermaid
graph LR
    subgraph Frontend
        UI[UI Components]
        Services[Service Layer]
        Models[Data Models]
    end
    
    subgraph Backend
        Routes[API Routes]
        Operations[Operations]
        Python[Python Bridge]
    end
    
    subgraph Python
        VMMgr[VM Manager]
        VMOps[VM Operations]
    end
    
    UI --> Services
    Services --> Models
    Services --> Routes
    Routes --> Operations
    Operations --> Python
    Python --> VMMgr
    Python --> VMOps
```

## Component Hierarchy

```mermaid
classDiagram
    class BaseComponent {
        +container
        +init()
        +render()
        +attachEventListeners()
        +update()
        +destroy()
    }
    
    class VMList {
        +vmService
        +load()
        +startAutoUpdate()
    }
    
    class VMCard {
        +vm
        +render()
        +handleAction()
    }
    
    class VMDialog {
        +mode
        +show()
        +hide()
    }
    
    class VMViewer {
        +open()
        +close()
        +connectVNC()
    }
    
    BaseComponent <|-- VMList
    BaseComponent <|-- VMCard
    BaseComponent <|-- VMDialog
    
    class VMManagerApp {
        +services
        +vmList
        +createDialog
        +editDialog
        +viewer
        +init()
        +load()
    }
    
    VMManagerApp --> VMList
    VMManagerApp --> VMDialog
    VMManagerApp --> VMViewer
```

## Service Layer Pattern

```mermaid
graph TB
    App[VMManagerApp] --> Registry[ServiceRegistry]
    Registry --> APIClient[APIClient]
    Registry --> VMService[VMService]
    
    VMService --> APIClient
    APIClient -->|HTTP| Express[Express API]
    
    style Registry fill:#dafc7b
    style VMService fill:#77874c
    style APIClient fill:#77874c
```

## Data Flow: VM Creation

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant Service
    participant API
    participant Python
    participant QEMU
    
    User->>UI: Create VM
    UI->>Service: create(config)
    Service->>API: POST /vms
    API->>Python: create_vm()
    Python->>Python: Save YAML config
    Python-->>API: Success
    API-->>Service: Success
    Service-->>UI: VM Created
    
    UI->>Service: createDisk()
    Service->>API: POST /vms/:name/create-disk
    API->>Python: create_vm_disk()
    Python->>QEMU: qemu-img create
    QEMU-->>Python: Disk created
    Python-->>API: Success
    API-->>Service: Success
    Service-->>UI: Progress update
```

## Request Flow

```mermaid
graph LR
    A[User Action] --> B[Component]
    B --> C[Service Method]
    C --> D[APIClient]
    D --> E[Express Route]
    E --> F[Route Handler]
    F --> G[Python Bridge]
    G --> H[Python Module]
    H --> I[System/File]
    I --> H
    H --> G
    G --> F
    F --> E
    E --> D
    D --> C
    C --> B
    B --> A
```

## File Structure

```
cyber_workbench/
├── web-ui/                    # Frontend + Backend
│   ├── api/                   # Express API routes
│   │   ├── routes.js          # Route definitions
│   │   ├── vm.js              # VM endpoints
│   │   ├── operations.js      # VM operations wrapper
│   │   ├── docs.js            # Documentation API
│   │   ├── python-bridge.js   # Python subprocess bridge
│   │   ├── nginx-manager.js   # nginx process management
│   │   ├── vm-tracker.js      # VM tracking & lifecycle
│   │   └── progress.js        # Progress tracking
│   ├── public/                # Static files
│   │   ├── js/
│   │   │   ├── app.js         # Main app orchestrator
│   │   │   ├── components/    # UI components
│   │   │   ├── services/      # Service layer
│   │   │   ├── models/        # Data models
│   │   │   ├── core/          # Core utilities
│   │   │   └── viewer.js      # VM viewer (noVNC)
│   │   └── css/               # Styles
│   └── server.js              # Express server
├── nginx/                     # nginx configuration
│   ├── novnc.conf            # Active nginx config (generated)
│   ├── novnc.conf.template   # Template for config generation
│   ├── nginx.pid             # nginx PID file
│   └── vm-tracker.json       # VM tracking state
├── vm_manager.py             # Python: Config management
├── vm_operations.py           # Python: QEMU operations
└── docs/                     # Documentation
```

