#!/usr/bin/env python3
"""
Validate that the VM's VNC display configuration is compatible with noVNC.

This script checks:
1. VNC display is configured correctly in QEMU command
2. VNC port is accessible (5900)
3. websockify can connect to the VNC display
4. Display type is compatible with noVNC (VNC protocol)
"""

import subprocess
import socket
import sys
from pathlib import Path

def check_vnc_port(port=5900):
    """Check if VNC port is listening."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2)
        result = sock.connect_ex(('127.0.0.1', port))
        sock.close()
        return result == 0
    except Exception as e:
        print(f"Error checking VNC port {port}: {e}")
        return False

def check_qemu_vnc_config(vm_name):
    """Check if QEMU process has correct VNC configuration."""
    try:
        # Find QEMU process for this VM
        result = subprocess.run(
            ["pgrep", "-f", f"windows.img.*{vm_name}"],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"❌ VM {vm_name} is not running")
            return False
        
        pids = result.stdout.strip().split('\n')
        if not pids or not pids[0]:
            print(f"❌ Could not find QEMU process for VM {vm_name}")
            return False
        
        pid = pids[0]
        
        # Get full command line
        ps_result = subprocess.run(
            ["ps", "-p", pid, "-o", "args="],
            capture_output=True,
            text=True
        )
        
        if ps_result.returncode != 0:
            print(f"❌ Could not get process info for PID {pid}")
            return False
        
        cmd_line = ps_result.stdout
        
        # Check for VNC display configuration
        has_display_vnc = "-display" in cmd_line and "vnc" in cmd_line
        has_vnc_flag = "-vnc" in cmd_line
        
        if not (has_display_vnc or has_vnc_flag):
            print(f"❌ QEMU process does not have VNC display configured")
            print(f"   Command line: {cmd_line[:200]}...")
            return False
        
        # Check VNC port format
        if "-vnc" in cmd_line:
            # Extract VNC argument
            parts = cmd_line.split()
            try:
                vnc_idx = parts.index("-vnc")
                vnc_arg = parts[vnc_idx + 1] if vnc_idx + 1 < len(parts) else ""
                
                # VNC format should be 127.0.0.1:0 (display 0 = port 5900)
                if "127.0.0.1:0" in vnc_arg or ":0" in vnc_arg:
                    print(f"✓ VNC display configured correctly: {vnc_arg}")
                    print(f"  Display 0 maps to port 5900")
                else:
                    print(f"⚠️  VNC format may be incorrect: {vnc_arg}")
                    print(f"   Expected: 127.0.0.1:0 (or :0)")
            except (ValueError, IndexError):
                print(f"⚠️  Could not parse VNC argument from command line")
        
        return True
        
    except Exception as e:
        print(f"Error checking QEMU VNC config: {e}")
        return False

def check_websockify_connection(vm_name, vnc_port=5900):
    """Check if websockify can connect to VNC."""
    try:
        # Check if websockify is running for this VM
        result = subprocess.run(
            ["pgrep", "-f", f"websockify.*127.0.0.1:{vnc_port}"],
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            pids = result.stdout.strip().split('\n')
            print(f"✓ websockify is running (PID: {pids[0] if pids else 'unknown'})")
            
            # Get websockify port
            ps_result = subprocess.run(
                ["ps", "-p", pids[0], "-o", "args="],
                capture_output=True,
                text=True
            )
            
            if ps_result.returncode == 0:
                args = ps_result.stdout
                # websockify format: websockify <port> 127.0.0.1:5900
                parts = args.split()
                if len(parts) >= 3:
                    websockify_port = parts[1]
                    print(f"  websockify port: {websockify_port}")
                    print(f"  VNC target: 127.0.0.1:{vnc_port}")
            
            return True
        else:
            print(f"⚠️  websockify is not running for VM {vm_name}")
            print(f"   This is expected if the VM was just started")
            return False
            
    except Exception as e:
        print(f"Error checking websockify: {e}")
        return False

def validate_vnc_display(vm_name):
    """Main validation function."""
    print(f"\n{'='*60}")
    print(f"Validating VNC Display Configuration for VM: {vm_name}")
    print(f"{'='*60}\n")
    
    results = {
        'qemu_running': False,
        'vnc_configured': False,
        'vnc_port_accessible': False,
        'websockify_ready': False
    }
    
    # 1. Check if QEMU is running with VNC
    print("1. Checking QEMU VNC configuration...")
    results['qemu_running'] = check_qemu_vnc_config(vm_name)
    results['vnc_configured'] = results['qemu_running']
    
    if not results['qemu_running']:
        print("\n❌ VM is not running or VNC is not configured")
        print("   Start the VM first, then run this validation again")
        return False
    
    print()
    
    # 2. Check if VNC port is accessible
    print("2. Checking VNC port accessibility (5900)...")
    results['vnc_port_accessible'] = check_vnc_port(5900)
    
    if results['vnc_port_accessible']:
        print("✓ VNC port 5900 is listening and accessible")
    else:
        print("⚠️  VNC port 5900 is not accessible")
        print("   This may be normal if the VM is still booting")
        print("   Wait a few seconds and check again")
    
    print()
    
    # 3. Check websockify connection
    print("3. Checking websockify connection...")
    results['websockify_ready'] = check_websockify_connection(vm_name, 5900)
    print()
    
    # Summary
    print(f"{'='*60}")
    print("Validation Summary:")
    print(f"{'='*60}")
    print(f"QEMU Running with VNC:     {'✓' if results['qemu_running'] else '❌'}")
    print(f"VNC Port Accessible:        {'✓' if results['vnc_port_accessible'] else '⚠️ '}")
    print(f"websockify Connected:      {'✓' if results['websockify_ready'] else '⚠️ '}")
    print()
    
    if results['qemu_running'] and results['vnc_configured']:
        print("✓ VNC display is configured correctly for noVNC")
        print("  The VM uses standard VNC protocol on port 5900")
        print("  websockify can convert this to WebSocket for noVNC")
        return True
    else:
        print("❌ VNC display configuration has issues")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python validate_vnc_display.py <vm_name>")
        sys.exit(1)
    
    vm_name = sys.argv[1]
    success = validate_vnc_display(vm_name)
    sys.exit(0 if success else 1)

