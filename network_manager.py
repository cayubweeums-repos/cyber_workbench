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
        # Ensure text mode is set (default to True)
        if "text" not in kwargs:
            kwargs["text"] = True
        
        if use_sudo:
            self._ensure_sudo_password()
            kwargs = kwargs.copy()
            input_data = kwargs.pop("input", "")
            if input_data is None:
                input_data = ""
            kwargs["input"] = f"{self.sudo_password}\n{input_data}"
            cmd = ["sudo", "-S"] + cmd
        
        result = subprocess.run(
            cmd,
            capture_output=True,
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
        """Create bridge on macOS using ifconfig."""
        # NOTE: On macOS, bridge interfaces are created as bridge0/bridge1/...
        # Renaming to arbitrary names (e.g. "br-main") is not reliably supported and can fail
        # with: "ifconfig: name: bad value". We therefore persist the actual bridge interface
        # name in our network config file and reuse it on subsequent runs.
        bridge_name = None
        
        # If we already have a saved config, prefer that bridge name
        existing_config = self.get_network_config(network_name)
        if existing_config and existing_config.get("bridge_name"):
            bridge_name = existing_config["bridge_name"]
        
        # Check if bridge already exists
        if bridge_name:
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
        
        def _clean_stderr(stderr: str) -> str:
            """Remove sudo password prompt from stderr output."""
            if stderr:
                # Remove "Password:" prompt that sudo -S outputs to stderr
                stderr = stderr.replace("Password:", "").strip()
                # Remove any leading/trailing whitespace
                return stderr.strip()
            return stderr
        
        try:
            # Snapshot interfaces before creation so we can reliably identify the new bridge.
            before = self._run_command(["ifconfig", "-l"], use_sudo=False)
            before_ifaces = set(before.stdout.split()) if before.returncode == 0 and before.stdout else set()

            # Create bridge interface with auto-generated name
            # On macOS, ifconfig bridge create creates a bridge with auto-generated name (bridge0, bridge1, etc.)
            result = self._run_command([
                "ifconfig", "bridge", "create"
            ], use_sudo=True)
            
            if result.returncode != 0:
                stderr = _clean_stderr(result.stderr)
                raise RuntimeError(f"Failed to create bridge: {stderr}")
            
            # Identify the created bridge by diffing interface lists.
            after = self._run_command(["ifconfig", "-l"], use_sudo=False)
            if after.returncode != 0:
                raise RuntimeError("Failed to list interfaces after bridge creation")
            after_ifaces = set(after.stdout.split()) if after.stdout else set()

            created_bridge = None
            created = [i for i in (after_ifaces - before_ifaces) if i.startswith("bridge")]
            if created:
                created_bridge = sorted(created)[0]
            else:
                # Fallback: choose highest-numbered bridge interface
                candidates = [i for i in after_ifaces if i.startswith("bridge")]
                if not candidates:
                    raise RuntimeError("Failed to identify newly created bridge interface")
                def _bridge_num(name: str) -> int:
                    try:
                        return int(name.replace("bridge", ""))
                    except Exception:
                        return -1
                created_bridge = sorted(candidates, key=_bridge_num)[-1]
            
            bridge_name = created_bridge
            
            # Configure bridge IP
            result = self._run_command([
                "ifconfig", bridge_name, "inet", gateway_ip, "netmask", str(network.netmask)
            ], use_sudo=True)
            
            if result.returncode != 0:
                stderr = _clean_stderr(result.stderr)
                # Clean up on failure
                self._run_command(["ifconfig", bridge_name, "destroy"], use_sudo=True)
                raise RuntimeError(f"Failed to configure bridge IP: {stderr}")
            
            # Bring bridge up
            result = self._run_command([
                "ifconfig", bridge_name, "up"
            ], use_sudo=True)
            
            if result.returncode != 0:
                stderr = _clean_stderr(result.stderr)
                # Clean up on failure
                self._run_command(["ifconfig", bridge_name, "destroy"], use_sudo=True)
                raise RuntimeError(f"Failed to bring bridge up: {stderr}")
            
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
    
    def create_tap_interface(self, tap_name: str, bridge_name: str):
        """Create a TAP interface and attach it to a bridge.
        
        Returns:
            - On Linux: the tap interface name (string) on success
            - On macOS: the created tap interface name (e.g. "tap0") on success
            - False on failure
        """
        system = platform.system()
        
        if system == "Darwin":
            # macOS TAP interfaces require a TAP driver (e.g., tuntaposx).
            # We cannot reliably rename TAP interfaces, so we create one and return its real name (tap0/tap1/...).
            before = self._run_command(["ifconfig", "-l"], use_sudo=False)
            before_ifaces = set(before.stdout.split()) if before.returncode == 0 and before.stdout else set()

            create = self._run_command(["ifconfig", "tap", "create"], use_sudo=True)
            if create.returncode != 0:
                stderr = (create.stderr or "").strip()
                raise RuntimeError(
                    "Failed to create TAP interface on macOS (ifconfig tap create). "
                    "TAP is optional; Cyber Workbench can fall back to QEMU user-mode networking. "
                    "To use bridged environment networks, install a macOS TAP driver (e.g., tuntaposx) and retry. "
                    f"Error: {stderr}"
                )

            after = self._run_command(["ifconfig", "-l"], use_sudo=False)
            after_ifaces = set(after.stdout.split()) if after.returncode == 0 and after.stdout else set()
            created = [i for i in (after_ifaces - before_ifaces) if i.startswith("tap")]
            if not created:
                # Fallback: pick highest tapN
                candidates = [i for i in after_ifaces if i.startswith("tap")]
                if not candidates:
                    raise RuntimeError("Failed to identify created TAP interface on macOS")
                def _tap_num(name: str) -> int:
                    try:
                        return int(name.replace("tap", ""))
                    except Exception:
                        return -1
                tap_actual = sorted(candidates, key=_tap_num)[-1]
            else:
                tap_actual = sorted(created)[0]

            try:
                # Bring tap up
                up = self._run_command(["ifconfig", tap_actual, "up"], use_sudo=True)
                if up.returncode != 0:
                    raise RuntimeError(f"Failed to bring TAP up: {(up.stderr or '').strip()}")

                # Add tap to bridge
                addm = self._run_command(["ifconfig", bridge_name, "addm", tap_actual], use_sudo=True)
                if addm.returncode != 0:
                    raise RuntimeError(f"Failed to add TAP to bridge: {(addm.stderr or '').strip()}")

                return tap_actual
            except Exception:
                # Best-effort cleanup: detach + destroy tap so we don't leak interfaces on failure
                try:
                    self._run_command(["ifconfig", bridge_name, "deletem", tap_actual], use_sudo=True)
                except Exception:
                    pass
                try:
                    self._run_command(["ifconfig", tap_actual, "destroy"], use_sudo=True)
                except Exception:
                    pass
                raise
        elif system == "Linux":
            # Interface names are limited (typically 15 chars). Enforce a safe length.
            tap_actual = tap_name[:15]

            # If it already exists, just ensure it's up and enslaved.
            exists = self._run_command(["ip", "link", "show", tap_actual], use_sudo=False)
            if exists.returncode != 0:
                result = self._run_command([
                    "ip", "tuntap", "add", "mode", "tap", "name", tap_actual
                ], use_sudo=True)
                if result.returncode != 0:
                    raise RuntimeError(f"Failed to create TAP: {result.stderr}")

            # Bring TAP up
            result = self._run_command(["ip", "link", "set", tap_actual, "up"], use_sudo=True)
            if result.returncode != 0:
                raise RuntimeError(f"Failed to bring TAP up: {result.stderr}")

            # Add TAP to bridge
            result = self._run_command(["ip", "link", "set", tap_actual, "master", bridge_name], use_sudo=True)
            if result.returncode != 0:
                # Best-effort cleanup so we don't leak the tap interface
                try:
                    self._run_command(["ip", "link", "set", tap_actual, "down"], use_sudo=True)
                except Exception:
                    pass
                try:
                    self._run_command(["ip", "link", "delete", tap_actual], use_sudo=True)
                except Exception:
                    pass
                raise RuntimeError(f"Failed to attach TAP to bridge: {result.stderr}")

            return tap_actual
        else:
            return False

    def delete_tap_interface(self, tap_name: str, bridge_name: Optional[str] = None) -> bool:
        """Delete a TAP interface (best-effort detach from bridge first).
        
        NOTE: On macOS, bridges do not automatically delete member TAP interfaces.
        """
        system = platform.system()
        try:
            if system == "Darwin":
                if bridge_name:
                    # Detach from bridge (ignore failures)
                    self._run_command(["ifconfig", bridge_name, "deletem", tap_name], use_sudo=True)
                result = self._run_command(["ifconfig", tap_name, "destroy"], use_sudo=True)
                return result.returncode == 0
            elif system == "Linux":
                self._run_command(["ip", "link", "set", tap_name, "down"], use_sudo=True)
                result = self._run_command(["ip", "link", "delete", tap_name], use_sudo=True)
                return result.returncode == 0
            else:
                return False
        except Exception as e:
            raise RuntimeError(f"Error deleting TAP interface {tap_name}: {e}")
    
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

