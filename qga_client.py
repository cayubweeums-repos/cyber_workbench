#!/usr/bin/env python3
"""QEMU Guest Agent Client - Provides command execution and desktop-ready detection"""

import os
import json
import base64
import socket
import select
import time
from pathlib import Path
from typing import Optional, Dict, Any


class QGAClient:
    """QEMU Guest Agent client using QMP protocol"""
    
    def __init__(self, socket_path: str):
        self.socket_path = socket_path
        self.sock = None
    
    def connect(self):
        """Connect to QGA socket"""
        # Check if socket is still valid
        if self.sock:
            try:
                # Try to check if socket is still alive
                self.sock.getpeername()
                return  # Socket is still valid
            except (OSError, AttributeError):
                # Socket is closed or invalid, reconnect
                self.disconnect()
        
        # Check if socket file exists
        if not Path(self.socket_path).exists():
            raise ConnectionError(f"QGA socket not found: {self.socket_path}")
        
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(10.0)  # 10 second timeout
        self.sock.connect(self.socket_path)
        # Read and discard the QMP greeting
        try:
            self._receive()
        except socket.timeout:
            pass  # No greeting received, continue anyway
    
    def disconnect(self):
        """Disconnect from QGA socket"""
        if self.sock:
            self.sock.close()
            self.sock = None
    
    def _send(self, cmd):
        """Send command to QGA"""
        data = json.dumps(cmd).encode('utf-8') + b'\n'  # QMP requires newline
        try:
            self.sock.sendall(data)
        except (BrokenPipeError, ConnectionResetError, OSError):
            # Connection was closed, reconnect and retry
            self.disconnect()
            self.connect()
            self.sock.sendall(data)
    
    def _receive(self):
        """Receive response from QGA"""
        data = b''
        self.sock.setblocking(False)  # Non-blocking mode
        
        start_time = time.time()
        timeout = 10.0
        
        while time.time() - start_time < timeout:
            # Wait for data to be available
            ready = select.select([self.sock], [], [], 0.1)
            if ready[0]:
                try:
                    chunk = self.sock.recv(4096)
                    if not chunk:
                        break
                    data += chunk
                    # Try to parse JSON
                    try:
                        self.sock.setblocking(True)
                        return json.loads(data.decode('utf-8'))
                    except json.JSONDecodeError:
                        continue
                except BlockingIOError:
                    time.sleep(0.01)
                    continue
        
        self.sock.setblocking(True)
        if data:
            try:
                return json.loads(data.decode('utf-8'))
            except json.JSONDecodeError:
                pass
        return None
    
    def execute(self, command, args=None, env=None, input_data=None, capture_output=True):
        """Execute command in guest VM"""
        self.connect()
        
        cmd = {
            "execute": "guest-exec",
            "arguments": {
                "path": command,
                "capture-output": capture_output
            }
        }
        
        if args:
            cmd["arguments"]["arg"] = args
        if env:
            cmd["arguments"]["env"] = env
        if input_data:
            cmd["arguments"]["input-data"] = base64.b64encode(input_data.encode()).decode()
        
        try:
            self._send(cmd)
            response = self._receive()
        except (BrokenPipeError, ConnectionResetError, OSError) as e:
            # Connection lost, try to reconnect and retry once
            self.disconnect()
            self.connect()
            self._send(cmd)
            response = self._receive()
        
        if response and "return" in response:
            return response["return"]
        elif response and "error" in response:
            error_desc = response["error"].get("desc", str(response["error"]))
            raise Exception(f"QGA execute failed: {error_desc}")
        else:
            raise Exception("Invalid response from QGA")
    
    def get_exec_status(self, pid):
        """Get status of executed command"""
        self.connect()
        
        cmd = {
            "execute": "guest-exec-status",
            "arguments": {"pid": pid}
        }
        
        try:
            self._send(cmd)
            response = self._receive()
        except (BrokenPipeError, ConnectionResetError, OSError) as e:
            # Connection lost, try to reconnect and retry once
            self.disconnect()
            self.connect()
            self._send(cmd)
            response = self._receive()
        
        if response and "return" in response:
            result = response["return"]
            # Decode base64 output
            if "out-data" in result:
                result["stdout"] = base64.b64decode(result["out-data"]).decode('utf-8', errors='replace')
                del result["out-data"]
            if "err-data" in result:
                result["stderr"] = base64.b64decode(result["err-data"]).decode('utf-8', errors='replace')
                del result["err-data"]
            return result
        elif response and "error" in response:
            error_desc = response["error"].get("desc", str(response["error"]))
            raise Exception(f"QGA exec-status failed: {error_desc}")
        else:
            raise Exception("Invalid response from QGA")
    
    def check_desktop_ready(self) -> Dict[str, Any]:
        """Check if Windows desktop is ready
        
        Returns True only when:
        - explorer.exe is running in a user session (SessionId != 0)
        
        Note: QGA commands run as SYSTEM, so we can't check current user identity.
        Instead, we verify explorer.exe is running in a user session, which indicates
        a logged-in user with an active desktop.
        
        Returns detailed error information on failure for debugging.
        """
        error_details = []
        
        try:
            # Simplified PowerShell check: explorer.exe in user session
            ps_cmd = """
            $errors = @()
            
            # Check if explorer.exe is running and in a user session
            try {
                $explorer = Get-Process -Name explorer -ErrorAction SilentlyContinue
                if (-not $explorer) {
                    $errors += "Explorer.exe not found"
                } else {
                    # Check if explorer is running in a user session (SessionId 0 is system session)
                    $userSession = $false
                    foreach ($proc in $explorer) {
                        if ($proc.SessionId -ne 0) {
                            $userSession = $true
                            break
                        }
                    }
                    if (-not $userSession) {
                        $errors += "Explorer.exe found but only in system session (SessionId 0)"
                    }
                }
            } catch {
                $errors += "Failed to check explorer.exe: $($_.Exception.Message)"
            }
            
            # Output errors as JSON if any, otherwise success
            if ($errors.Count -gt 0) {
                $result = @{
                    success = $false
                    errors = $errors
                } | ConvertTo-Json -Compress
                Write-Output $result
                exit 1
            } else {
                Write-Output '{"success":true}'
                exit 0
            }
            """
            
            # Execute PowerShell command
            try:
                result = self.execute('powershell.exe', ['-Command', ps_cmd])
                pid = result.get('pid')
                
                if not pid:
                    return {
                        "ready": False,
                        "error": "QGA execute failed - no PID returned",
                        "details": "Could not start PowerShell command via QGA"
                    }
            except Exception as e:
                return {
                    "ready": False,
                    "error": f"QGA execute failed: {str(e)}",
                    "details": "Failed to communicate with QEMU Guest Agent"
                }
            
            # Wait for command to complete (up to 5 seconds)
            max_wait = 50  # 50 * 0.1 = 5 seconds
            for i in range(max_wait):
                time.sleep(0.1)
                try:
                    status = self.get_exec_status(pid)
                    
                    if status.get('exited', False):
                        exit_code = status.get('exitcode', 1)
                        stdout = status.get('stdout', '').strip()
                        stderr = status.get('stderr', '').strip()
                        
                        # Parse PowerShell output
                        if exit_code == 0:
                            # Success case
                            try:
                                output = json.loads(stdout) if stdout else {}
                                if output.get('success') is True:
                                    return {
                                        "ready": True,
                                        "explorer_running": True
                                    }
                            except json.JSONDecodeError:
                                # If output doesn't parse, check if stdout indicates success
                                if stdout and 'success' in stdout.lower():
                                    return {
                                        "ready": True,
                                        "explorer_running": True
                                    }
                        
                        # Failure case - try to parse error details
                        error_msg = "Desktop not ready"
                        if stdout:
                            try:
                                error_data = json.loads(stdout)
                                if 'errors' in error_data:
                                    error_details = error_data['errors']
                                    error_msg = "; ".join(error_details) if isinstance(error_details, list) else str(error_details)
                            except json.JSONDecodeError:
                                # If not JSON, use stdout/stderr as error message
                                if stdout:
                                    error_msg = stdout
                                elif stderr:
                                    error_msg = stderr
                        elif stderr:
                            error_msg = stderr
                        
                        return {
                            "ready": False,
                            "explorer_running": False,
                            "error": error_msg,
                            "details": error_details if error_details else "Desktop readiness checks failed"
                        }
                        
                except Exception as e:
                    # If get_exec_status fails, continue waiting (might be race condition)
                    if i == max_wait - 1:
                        return {
                            "ready": False,
                            "explorer_running": False,
                            "error": f"Failed to get command status: {str(e)}",
                            "details": "Command may still be running or QGA communication failed"
                        }
            
            # Timeout case
            return {
                "ready": False,
                "explorer_running": False,
                "error": "Command execution timeout (5 seconds)",
                "details": "PowerShell command did not complete within timeout period"
            }
            
        except Exception as e:
            # Catch-all for any unexpected errors
            return {
                "ready": False,
                "explorer_running": False,
                "error": f"Unexpected error: {str(e)}",
                "details": f"Exception type: {type(e).__name__}"
            }


def check_vm_desktop_ready(vm_name: str, repo_root: str) -> Dict[str, Any]:
    """Convenience function to check desktop ready for a VM"""
    repo_path = Path(repo_root)
    qga_socket = repo_path / "vms" / vm_name / "qga" / "qga.sock"
    
    if not qga_socket.exists():
        return {
            "ready": False,
            "error": "QGA socket not found",
            "details": f"QGA socket does not exist at {qga_socket}. VM may not be running or QGA not configured."
        }
    
    try:
        client = QGAClient(str(qga_socket))
        result = client.check_desktop_ready()
        client.disconnect()
        return result
    except Exception as e:
        return {
            "ready": False,
            "error": f"Failed to connect to QGA: {str(e)}",
            "details": "Could not establish connection to QEMU Guest Agent"
        }

