"""VM Management module for handling VM configurations and lifecycle."""

import os
import yaml
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict


class VMConfig:
    """Represents a VM configuration stored in YAML format."""
    
    def __init__(self, name: str, cpu_cores: int = 8, ram_gb: int = 8, 
                 disk_size_gb: int = 64, network: str = "user"):
        self.name = name
        self.cpu_cores = cpu_cores
        self.ram_gb = ram_gb
        self.disk_size_gb = disk_size_gb
        self.network = network
        self.created = datetime.now().isoformat()
    
    def to_dict(self) -> Dict:
        """Convert config to dictionary for YAML serialization."""
        return {
            'name': self.name,
            'cpu_cores': self.cpu_cores,
            'ram_gb': self.ram_gb,
            'disk_size_gb': self.disk_size_gb,
            'network': self.network,
            'created': self.created
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'VMConfig':
        """Create VMConfig from dictionary."""
        config = cls(
            name=data['name'],
            cpu_cores=data.get('cpu_cores', 8),
            ram_gb=data.get('ram_gb', 8),
            disk_size_gb=data.get('disk_size_gb', 64),
            network=data.get('network', 'user')
        )
        config.created = data.get('created', datetime.now().isoformat())
        return config


class VMManager:
    """Manages VM configurations and operations."""
    
    def __init__(self, repo_root: str, vms_dir: Optional[str] = None):
        """
        Initialize VMManager.
        
        Args:
            repo_root: Root directory of the repository
            vms_dir: Optional custom directory for VMs. If None, uses repo_root/vms
        """
        self.repo_root = Path(repo_root)
        if vms_dir:
            self.vms_dir = Path(vms_dir)
        else:
            self.vms_dir = self.repo_root / "vms"
        self.vms_dir.mkdir(parents=True, exist_ok=True)
        self.sudo_password: Optional[str] = None

    def set_sudo_password(self, password: str):
        """Store sudo password for operations requiring elevation."""
        self.sudo_password = password

    def _ensure_sudo_password(self):
        if not self.sudo_password:
            raise RuntimeError("Sudo password not set. Please provide it in the UI.")

    def _run_command(self, cmd: List[str], use_sudo: bool = False, **kwargs):
        """Run subprocess command optionally with sudo."""
        if use_sudo:
            self._ensure_sudo_password()
            kwargs = kwargs.copy()
            input_data = kwargs.pop("input", "")
            if input_data is None:
                input_data = ""
            if not kwargs.get("text"):
                kwargs["text"] = True
            kwargs["input"] = f"{self.sudo_password}\n{input_data}"
            cmd = ["sudo", "-S"] + cmd
        return subprocess.run(cmd, **kwargs)
    
    def list_vms(self, exclude_environments: bool = True) -> List[str]:
        """
        List all VM names by scanning the vms directory.
        
        Args:
            exclude_environments: If True, exclude VMs in environment directories
        """
        vms = []
        if self.vms_dir.exists():
            for item in self.vms_dir.iterdir():
                if item.is_dir() and item.name != "shared":
                    # Skip environment directories if excluding
                    if exclude_environments:
                        # Check if this is an environment directory (contains environments/ subdir)
                        env_dir = self.repo_root / "environments" / item.name
                        if env_dir.exists():
                            continue
                    
                    config_file = item / "config.yaml"
                    if config_file.exists():
                        vms.append(item.name)
        return sorted(vms)
    
    def get_vm_config(self, vm_name: str) -> Optional[VMConfig]:
        """Load VM configuration from YAML file."""
        config_file = self.vms_dir / vm_name / "config.yaml"
        if not config_file.exists():
            return None
        
        try:
            with open(config_file, 'r') as f:
                data = yaml.safe_load(f)
                return VMConfig.from_dict(data)
        except Exception as e:
            print(f"Error loading config for {vm_name}: {e}")
            return None
    
    def save_vm_config(self, config: VMConfig) -> bool:
        """Save VM configuration to YAML file."""
        vm_dir = self.vms_dir / config.name
        vm_dir.mkdir(exist_ok=True)
        config_file = vm_dir / "config.yaml"
        
        try:
            with open(config_file, 'w') as f:
                yaml.dump(config.to_dict(), f, default_flow_style=False)
            return True
        except Exception as e:
            print(f"Error saving config for {config.name}: {e}")
            return False
    
    def create_vm(self, name: str, cpu_cores: int, ram_gb: int, 
                  disk_size_gb: int) -> bool:
        """Create a new VM configuration."""
        # Validate VM name
        if not self._validate_vm_name(name):
            return False
        
        # Check if VM already exists
        if (self.vms_dir / name).exists():
            print(f"VM '{name}' already exists")
            return False
        
        # Create VM directory
        vm_dir = self.vms_dir / name
        vm_dir.mkdir(exist_ok=True)
        
        # Create and save config
        config = VMConfig(name, cpu_cores, ram_gb, disk_size_gb)
        return self.save_vm_config(config)
    
    def edit_vm(self, old_name: str, new_name: str, cpu_cores: int, 
                ram_gb: int) -> bool:
        """Edit VM configuration (name, CPU cores, RAM)."""
        # Load existing config
        config = self.get_vm_config(old_name)
        if not config:
            print(f"VM '{old_name}' not found")
            return False
        
        # Validate new name if changed
        if new_name != old_name:
            if not self._validate_vm_name(new_name):
                return False
            if (self.vms_dir / new_name).exists():
                print(f"VM '{new_name}' already exists")
                return False
        
        # Update config
        config.name = new_name
        config.cpu_cores = cpu_cores
        config.ram_gb = ram_gb
        
        # If name changed, rename directory
        if new_name != old_name:
            old_dir = self.vms_dir / old_name
            new_dir = self.vms_dir / new_name
            if old_dir.exists():
                old_dir.rename(new_dir)
        
        # Save updated config
        return self.save_vm_config(config)
    
    def delete_vm(self, name: str) -> bool:
        """Delete a VM and all its files."""
        vm_dir = self.vms_dir / name
        if not vm_dir.exists():
            print(f"VM '{name}' not found")
            return False
        
        # Stop VM if running
        if self.is_vm_running(name):
            self.stop_vm(name)
        
        # Remove directory and all contents
        # Use sudo for deletion since some files may have been created with sudo
        # (e.g., files in $OEM$ directories, modified ISOs, etc.)
        import shutil
        try:
            try:
                shutil.rmtree(vm_dir)
                print(f"✓ Deleted VM '{name}'")
                return True
            except PermissionError:
                # If permission denied, use sudo
                print(f"Permission denied, using sudo to delete '{name}'...")
                self._run_command(
                    ["rm", "-rf", str(vm_dir)],
                    use_sudo=True,
                    capture_output=True,
                    text=True,
                    check=True
                )
                print(f"✓ Deleted VM '{name}' with sudo")
                return True
        except subprocess.CalledProcessError as e:
            print(f"Error deleting VM '{name}' with sudo: {e}")
            print(f"stdout: {e.stdout}")
            print(f"stderr: {e.stderr}")
            return False
        except Exception as e:
            print(f"Error deleting VM '{name}': {e}")
            return False
    
    def is_vm_running(self, name: str) -> bool:
        """Check if a VM is currently running."""
        try:
            # Check for QEMU process with this VM's disk image
            vm_dir = self.vms_dir / name
            disk_image = vm_dir / "windows.img"
            
            if not disk_image.exists():
                return False
            
            # Check for running QEMU process
            result = subprocess.run(
                ['pgrep', '-f', f'windows.img.*{name}'],
                capture_output=True,
                text=True
            )
            return result.returncode == 0
        except Exception:
            return False
    
    def stop_vm(self, name: str) -> bool:
        """Stop a running VM."""
        # This method is kept for compatibility but actual stopping
        # should be done via VMOperations
        from vm_operations import VMOperations
        ops = VMOperations(str(self.repo_root))
        return ops.stop_vm(name)
    
    def _validate_vm_name(self, name: str) -> bool:
        """Validate VM name (alphanumeric, hyphens, underscores only)."""
        if not name or len(name) == 0:
            print("VM name cannot be empty")
            return False
        
        if not name.replace('-', '').replace('_', '').isalnum():
            print("VM name can only contain letters, numbers, hyphens, and underscores")
            return False
        
        if name == "shared":
            print("'shared' is a reserved name")
            return False
        
        return True
    
    def get_vm_path(self, vm_name: str) -> Path:
        """Get the full path to a VM's directory."""
        return self.vms_dir / vm_name
    
    def get_shared_path(self) -> Path:
        """Get the path to the shared resources directory."""
        return self.vms_dir / "shared"

