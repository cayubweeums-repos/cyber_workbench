"""Network Manager - Handles bridge and TAP interface management for environments."""

import os
import subprocess
import platform
from pathlib import Path
from typing import Optional, Dict, List
import ipaddress


class NetworkManager:
    """Manages bridge and TAP interfaces for environment networking."""
    
    def __init__(self, repo_root: str, sudo_password: Optional[str] = None):
        """
        Initialize NetworkManager.
        
        Args:
            repo_root: Root directory of the repository
            sudo_password: Optional sudo password for network operations
        """
        self.repo_root = Path(repo_root)
        self.networks_dir = self.repo_root / "networks"
        self.networks_dir.mkdir(exist_ok=True)
        self.sudo_password: Optional[str] = sudo_password
    
    def set_sudo_password(self, password: str):
        """Store sudo password for network operations."""
        self.sudo_password = password
    
    def _ensure_sudo_password(self):
        if not self.sudo_password:
            raise RuntimeError("Sudo password not set for network operations.")
    
    def _run_command(self, cmd: List[str], use_sudo: bool = False, **kwargs):
        """Run subprocess command, optionally with sudo."""
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
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            **kwargs
        )
        return result
    
    def create_bridge_network(self, network_name: str, subnet: str = None, isolated: bool = False) -> bool:
        """
        Create a bridge network for environment services.
        
        Args:
            network_name: Name of the network (e.g., "env-internal")
            subnet: CIDR subnet (e.g., "192.168.100.0/24"). Auto-assigned if None.
            isolated: If True, network has no internet access (no NAT/gateway)
        
        Returns:
            True if successful, False otherwise
        """
        try:
            system = platform.system()
            
            if system == "Darwin":
                # macOS uses bridge interfaces differently
                return self._create_macos_bridge(network_name, subnet, isolated)
            elif system == "Linux":
                return self._create_linux_bridge(network_name, subnet, isolated)
            else:
                raise RuntimeError(f"Unsupported OS for bridge networking: {system}")
        except Exception as e:
            # Don't print to stdout - let the caller handle errors
            raise RuntimeError(f"Failed to create bridge network: {str(e)}")
    
    def _create_macos_bridge(self, network_name: str, subnet: str = None, isolated: bool = False) -> bool:
        """Create bridge on macOS using bridge-utils or manual configuration."""
        bridge_name = f"br-{network_name}"
        
        # Check if bridge already exists
        result = self._run_command(["ifconfig", bridge_name], use_sudo=False)
        if result.returncode == 0:
            # Bridge already exists, just save config and return
            self._save_network_config(network_name, bridge_name, subnet or self._generate_subnet(network_name), isolated)
            return True
        
        # Generate subnet if not provided
        if not subnet:
            subnet = self._generate_subnet(network_name)
        
        # Parse subnet
        try:
            network = ipaddress.ip_network(subnet, strict=False)
            gateway_ip = str(network.network_address + 1)
        except ValueError as e:
            raise ValueError(f"Invalid subnet: {e}")
        
        try:
            # Create bridge interface
            # On macOS, we use ifconfig to create bridge
            result = self._run_command([
                "ifconfig", "bridge", "create", "name", bridge_name
            ], use_sudo=True)
            
            if result.returncode != 0:
                raise RuntimeError(f"Failed to create bridge: {result.stderr}")
            
            # Configure bridge IP
            result = self._run_command([
                "ifconfig", bridge_name, gateway_ip, "netmask", str(network.netmask)
            ], use_sudo=True)
            
            if result.returncode != 0:
                raise RuntimeError(f"Failed to configure bridge IP: {result.stderr}")
            
            # Bring bridge up
            result = self._run_command([
                "ifconfig", bridge_name, "up"
            ], use_sudo=True)
            
            if result.returncode != 0:
                raise RuntimeError(f"Failed to bring bridge up: {result.stderr}")
            
            # If not isolated, set up NAT (internet access)
            if not isolated:
                # Enable IP forwarding
                self._run_command([
                    "sysctl", "-w", "net.inet.ip.forwarding=1"
                ], use_sudo=True)
            
            # Save network config
            self._save_network_config(network_name, bridge_name, subnet, isolated)
            
            return True
        except Exception as e:
            # Re-raise with context
            raise RuntimeError(f"Error creating macOS bridge: {str(e)}")
    
    def _create_linux_bridge(self, network_name: str, subnet: str = None, isolated: bool = False) -> bool:
        """Create bridge on Linux using ip/brctl."""
        bridge_name = f"br-{network_name}"
        
        # Check if bridge already exists
        result = self._run_command(["ip", "link", "show", bridge_name], use_sudo=False)
        if result.returncode == 0:
            # Bridge already exists, just save config and return
            self._save_network_config(network_name, bridge_name, subnet or self._generate_subnet(network_name), isolated)
            return True
        
        # Generate subnet if not provided
        if not subnet:
            subnet = self._generate_subnet(network_name)
        
        # Parse subnet
        try:
            network = ipaddress.ip_network(subnet, strict=False)
            gateway_ip = str(network.network_address + 1)
        except ValueError as e:
            raise ValueError(f"Invalid subnet: {e}")
        
        try:
            # Create bridge
            result = self._run_command([
                "ip", "link", "add", "name", bridge_name, "type", "bridge"
            ], use_sudo=True)
            
            if result.returncode != 0:
                raise RuntimeError(f"Failed to create bridge: {result.stderr}")
            
            # Configure bridge IP
            result = self._run_command([
                "ip", "addr", "add", f"{gateway_ip}/{network.prefixlen}", "dev", bridge_name
            ], use_sudo=True)
            
            if result.returncode != 0:
                raise RuntimeError(f"Failed to configure bridge IP: {result.stderr}")
            
            # Bring bridge up
            result = self._run_command([
                "ip", "link", "set", bridge_name, "up"
            ], use_sudo=True)
            
            if result.returncode != 0:
                raise RuntimeError(f"Failed to bring bridge up: {result.stderr}")
            
            # If not isolated, set up NAT (internet access)
            if not isolated:
                # Enable IP forwarding
                self._run_command([
                    "sysctl", "-w", "net.ipv4.ip_forward=1"
                ], use_sudo=True)
                
                # Set up iptables NAT (if iptables is available)
                # Get default interface
                result = self._run_command([
                    "ip", "route", "show", "default"
                ], use_sudo=False)
                
                if result.returncode == 0 and result.stdout:
                    # Extract default interface (simplified)
                    default_if = None
                    for line in result.stdout.split('\n'):
                        if 'default via' in line:
                            parts = line.split()
                            if len(parts) > 4:
                                default_if = parts[4]
                                break
                    
                    if default_if:
                        # Set up NAT masquerade
                        self._run_command([
                            "iptables", "-t", "nat", "-A", "POSTROUTING",
                            "-s", str(network), "-o", default_if, "-j", "MASQUERADE"
                        ], use_sudo=True)
            
            # Save network config
            self._save_network_config(network_name, bridge_name, subnet, isolated)
            
            return True
        except Exception as e:
            # Re-raise with context
            raise RuntimeError(f"Error creating Linux bridge: {str(e)}")
    
    def _generate_subnet(self, network_name: str) -> str:
        """Generate a unique subnet based on network name hash."""
        import hashlib
        hash_obj = hashlib.md5(network_name.encode())
        hash_int = int(hash_obj.hexdigest()[:8], 16)
        # Use 192.168.x.0/24 range
        third_octet = (hash_int % 200) + 50  # 50-249 range
        return f"192.168.{third_octet}.0/24"
    
    def _save_network_config(self, network_name: str, bridge_name: str, subnet: str, isolated: bool):
        """Save network configuration to file."""
        config_file = self.networks_dir / f"{network_name}.yaml"
        import yaml
        
        config = {
            'name': network_name,
            'bridge_name': bridge_name,
            'subnet': subnet,
            'isolated': isolated
        }
        
        with open(config_file, 'w') as f:
            yaml.dump(config, f)
    
    def get_network_config(self, network_name: str) -> Optional[Dict]:
        """Get network configuration."""
        config_file = self.networks_dir / f"{network_name}.yaml"
        if not config_file.exists():
            return None
        
        import yaml
        with open(config_file, 'r') as f:
            return yaml.safe_load(f)
    
    def create_tap_interface(self, tap_name: str, bridge_name: str) -> bool:
        """Create a TAP interface and attach it to a bridge."""
        system = platform.system()
        
        if system == "Darwin":
            # macOS TAP interfaces
            result = self._run_command([
                "ifconfig", "bridge", "addm", tap_name, bridge_name
            ], use_sudo=True)
            return result.returncode == 0
        elif system == "Linux":
            # Create TAP interface
            result = self._run_command([
                "ip", "tuntap", "add", "mode", "tap", "name", tap_name
            ], use_sudo=True)
            
            if result.returncode != 0:
                raise RuntimeError(f"Failed to create TAP: {result.stderr}")
            
            # Bring TAP up
            result = self._run_command([
                "ip", "link", "set", tap_name, "up"
            ], use_sudo=True)
            
            if result.returncode != 0:
                raise RuntimeError(f"Failed to bring TAP up: {result.stderr}")
            
            # Add TAP to bridge
            result = self._run_command([
                "ip", "link", "set", tap_name, "master", bridge_name
            ], use_sudo=True)
            
            return result.returncode == 0
        else:
            return False
    
    def delete_bridge_network(self, network_name: str) -> bool:
        """Delete a bridge network."""
        config = self.get_network_config(network_name)
        if not config:
            return False
        
        bridge_name = config.get('bridge_name')
        if not bridge_name:
            return False
        
        system = platform.system()
        
        try:
            if system == "Darwin":
                result = self._run_command([
                    "ifconfig", bridge_name, "destroy"
                ], use_sudo=True)
            elif system == "Linux":
                # Bring bridge down
                self._run_command([
                    "ip", "link", "set", bridge_name, "down"
                ], use_sudo=True)
                
                # Delete bridge
                result = self._run_command([
                    "ip", "link", "delete", bridge_name
                ], use_sudo=True)
            else:
                return False
            
            # Remove config file
            config_file = self.networks_dir / f"{network_name}.yaml"
            if config_file.exists():
                config_file.unlink()
            
            return result.returncode == 0
        except Exception as e:
            raise RuntimeError(f"Error deleting bridge: {e}")
    
    def list_networks(self) -> List[str]:
        """List all managed networks."""
        networks = []
        if self.networks_dir.exists():
            for file in self.networks_dir.glob("*.yaml"):
                networks.append(file.stem)
        return sorted(networks)

