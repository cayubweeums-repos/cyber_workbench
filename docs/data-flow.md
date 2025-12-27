# Data Flow

## VM Model Structure

```mermaid
classDiagram
    class VM {
        +name: string
        +cpu_cores: number
        +ram_gb: number
        +disk_size_gb: number
        +network: string
        +created: string
        +running: boolean
        +progress: object
        +status: string
        +statusText: string
        +isProcessing(): boolean
    }
    
    class VMConfig {
        +name: string
        +cpu_cores: int
        +ram_gb: int
        +disk_size_gb: int
        +network: string
        +created: string
        +to_dict(): dict
        +from_dict(): VMConfig
    }
    
    VM -->|Serialized| YAML[config.yaml]
    VMConfig -->|Serialized| YAML
```

## Environment Model Notes

Environments persist informational metadata about the most recent start attempt:

- `lastStartWarnings: string[]` (warnings emitted when falling back from TAP/bridge networking to user-mode, or when environment networks fail to create)
- `lastStartedAt: string | null` (timestamp of last successful start)

## Data Transformation Flow

```mermaid
graph LR
    YAML[YAML Config] --> Python[Python VMConfig]
    Python --> JSON[JSON Response]
    JSON --> JS[JavaScript VM]
    JS --> UI[UI Display]
    
    UI -->|User Edit| JS
    JS --> JSON
    JSON --> Python
    Python --> YAML
```

## State Management

```mermaid
graph TB
    App[VMManagerApp] --> Service[VMService]
    Service --> API[API Calls]
    API --> Python[Python Backend]
    Python --> Files[YAML Files]
    
    Service --> Models[VM Models]
    Models --> Components[UI Components]
    Components --> App
    
    style App fill:#dafc7b
    style Service fill:#77874c
```

## Progress Data Flow

```mermaid
sequenceDiagram
    participant Operation
    participant Progress
    participant API
    participant Service
    participant Component
    participant UI
    
    Operation->>Progress: setProgress(name, data)
    Component->>Service: getProgress(name)
    Service->>API: GET /vms/:name/progress
    API->>Progress: getProgress(name)
    Progress-->>API: Progress data
    API-->>Service: Progress
    Service-->>Component: Progress
    Component->>UI: Update display
```

## Real-time Updates

```mermaid
graph TB
    App[VMManagerApp] --> List[VMList]
    List -->|setInterval| Service[VMService]
    Service -->|Poll| API[API]
    API -->|Check| Status[VM Status]
    Status -->|Return| API
    API -->|Update| Service
    Service -->|Update| List
    List -->|Re-render| Cards[VMCards]
```

