# Cyber Workbench

Unified containerized hypervisor system with visual environment builder.

## Features

- **Visual Environment Builder**: n8n-style drag-and-drop canvas for building multi-node environments
- **Single VM Quick Access**: Simplified workflow for single VM creation
- **Multi-Node Environments**: Create complex environments with VMs, containers, and services
- **Web Interfaces**: Access VMs via novnc/guac, services via webview

## Architecture

- **Backend**: Node.js/Express API server with Docker orchestration
- **Frontend**: React-based visual builder with React Flow
- **VM Management**: Leverages vapiorc backend components for Windows VM management
- **Container Management**: Unified management for Docker containers and services

## Quick Start

1. Build and start the system:
```bash
docker compose up -d
```

2. Access the frontend at http://localhost:3000
3. Access the backend API at http://localhost:8080

## Project Structure

```
cyber_workbench/
├── backend/          # Unified backend API
│   ├── api/          # API route handlers
│   ├── services/     # Business logic services
│   ├── utils/        # Utilities (from vapiorc)
│   └── vm-builder/   # Windows VM building components
├── frontend/         # React-based visual builder
└── compose.yml       # Docker Compose configuration
```

## Development

### Backend
```bash
cd backend
npm install
npm start
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

See `compose.yml` for configuration options including:
- Storage paths
- VM lifecycle settings
- Resource limits
- Network configuration
