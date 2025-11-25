# Cyber Workbench

Simple, easy-to-use workbench for security engineers, threat investigators, and anyone looking to play with malware. Provides a web-based interface for managing Windows VMs running in QEMU on macOS.

## Quick Start

1. Clone the repo
   ```bash
   git clone https://github.com/cayubweeums-repos/cyber_workbench.git
   cd cyber_workbench
   ```

2. Run the project
   ```bash
   make start
   ```

3. Open your browser
   - Navigate to `http://localhost:3000`
   - Create and manage Windows VMs through the web interface

## Architecture

This project follows **Object-Oriented Programming (OOP)**, **KISS principles**, and **modular design** to make it easy to extend and integrate new features.

### Key Principles
- **OOP**: All functionality encapsulated in classes
- **KISS**: Simple, focused classes with single responsibilities
- **Modularity**: Clear separation of concerns (Models, Services, Components)
- **Extensibility**: Easy to add new features (e.g., environments, services)

### Project Structure
- `web-ui/` - Web application (Node.js/Express frontend)
- `vm_manager.py` - Python VM configuration management
- `vm_operations.py` - Python QEMU operations and ISO preparation
- `vms/` - VM storage directory

## Documentation

- **`.cursorrules`** - Complete project context, goals, architecture, and guidelines
- **`web-ui/README.md`** - Web UI architecture and design principles
- **`web-ui/EXTENDING.md`** - Guide for extending the system with new features
- **`macos-windows11-arm-setup.md`** - Original setup guide

## Technology Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Backend**: Node.js/Express
- **Python**: VM operations via subprocess
- **Virtualization**: QEMU with HVF (macOS)
- **Viewer**: noVNC (browser-based)

## Platform

- **Target**: macOS (MacBook) exclusively
- **Not for**: Bare metal Linux, Docker containers, or production deployment

## Future Features

- **Environments**: Deploy pre-configured environments with multiple VMs and services
- **Templates**: VM and environment templates
- **Networking**: Advanced network configuration for environments

See `web-ui/EXTENDING.md` for how to add new features.
