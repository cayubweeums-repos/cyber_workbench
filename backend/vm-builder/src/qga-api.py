#!/usr/bin/env python3
"""QEMU Guest Agent REST API - Provides command execution and file operations"""

import os
import json
import base64
import socket
import select
import time
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

QGA_SOCKET = '/tmp/qga/qga.sock'
QMP_SOCKET = '/tmp/qmp/qmp.sock'

class QGAClient:
    """QEMU Guest Agent client using QMP protocol"""
    
    def __init__(self, socket_path):
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
    
    def read_file(self, path):
        """Read file from guest VM"""
        self.connect()
        
        # Open file for reading
        cmd = {"execute": "guest-file-open", "arguments": {"path": path, "mode": "r"}}
        self._send(cmd)
        response = self._receive()
        
        if not response or "return" not in response:
            raise Exception("Failed to open file")
        
        handle = response["return"]
        
        # Read file content
        cmd = {"execute": "guest-file-read", "arguments": {"handle": handle}}
        self._send(cmd)
        response = self._receive()
        
        # Close file
        self._send({"execute": "guest-file-close", "arguments": {"handle": handle}})
        self._receive()
        
        if response and "return" in response and "buf-b64" in response["return"]:
            return base64.b64decode(response["return"]["buf-b64"]).decode('utf-8', errors='replace')
        
        raise Exception("Failed to read file")
    
    def write_file(self, path, content):
        """Write file to guest VM"""
        self.connect()
        
        # Open file for writing
        cmd = {"execute": "guest-file-open", "arguments": {"path": path, "mode": "w"}}
        self._send(cmd)
        response = self._receive()
        
        if not response or "return" not in response:
            raise Exception("Failed to open file")
        
        handle = response["return"]
        
        # Write content
        content_b64 = base64.b64encode(content.encode('utf-8')).decode()
        cmd = {"execute": "guest-file-write", "arguments": {"handle": handle, "buf-b64": content_b64}}
        self._send(cmd)
        response = self._receive()
        
        # Close file
        self._send({"execute": "guest-file-close", "arguments": {"handle": handle}})
        self._receive()
        
        if response and "return" in response:
            return response["return"]
        
        raise Exception("Failed to write file")
    
    def get_info(self):
        """Get guest information"""
        self.connect()
        cmd = {"execute": "guest-info"}
        self._send(cmd)
        response = self._receive()
        return response.get("return", {}) if response else {}

class QMPClient:
    """QEMU Machine Protocol client for VM management (savevm/loadvm)"""
    
    def __init__(self, socket_path):
        self.socket_path = socket_path
        self.sock = None
    
    def connect(self):
        """Connect to QMP socket"""
        if self.sock:
            return
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(10.0)  # 10 second timeout
        self.sock.connect(self.socket_path)
        # Read and discard the QMP greeting
        try:
            self._receive()
        except socket.timeout:
            pass  # No greeting received, continue anyway
        
        # Send capabilities negotiation (required by QMP protocol)
        self._send({"execute": "qmp_capabilities"})
        self._receive()  # Read and discard the response
    
    def disconnect(self):
        """Disconnect from QMP socket"""
        if self.sock:
            self.sock.close()
            self.sock = None
    
    def _send(self, cmd):
        """Send command to QMP"""
        data = json.dumps(cmd).encode('utf-8')
        self.sock.sendall(data)
    
    def _receive(self):
        """Receive response from QMP"""
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
    
    def savevm(self, snapshot_name):
        """Create VM snapshot with memory state"""
        self.connect()
        
        # savevm is an HMP command, so we use human-monitor-command
        cmd = {
            "execute": "human-monitor-command",
            "arguments": {"command-line": f"savevm {snapshot_name}"}
        }
        
        self._send(cmd)
        response = self._receive()
        
        if response and "return" in response:
            return {"success": True, "snapshot": snapshot_name}
        elif response and "error" in response:
            raise Exception(response["error"].get("desc", str(response["error"])))
        else:
            raise Exception("Invalid response from QMP")
    
    def loadvm(self, snapshot_name):
        """Restore VM to snapshot state"""
        self.connect()
        
        # loadvm is an HMP command, so we use human-monitor-command
        cmd = {
            "execute": "human-monitor-command",
            "arguments": {"command-line": f"loadvm {snapshot_name}"}
        }
        
        self._send(cmd)
        response = self._receive()
        
        if response and "return" in response:
            return {"success": True, "snapshot": snapshot_name}
        elif response and "error" in response:
            raise Exception(response["error"].get("desc", str(response["error"])))
        else:
            raise Exception("Invalid response from QMP")
    
    def delvm(self, snapshot_name):
        """Delete VM snapshot"""
        self.connect()
        
        # delvm is an HMP command, so we use human-monitor-command
        cmd = {
            "execute": "human-monitor-command",
            "arguments": {"command-line": f"delvm {snapshot_name}"}
        }
        
        self._send(cmd)
        response = self._receive()
        
        if response and "return" in response:
            return {"success": True, "snapshot": snapshot_name}
        elif response and "error" in response:
            raise Exception(response["error"].get("desc", str(response["error"])))
        else:
            raise Exception("Invalid response from QMP")
    
    def query_snapshots(self):
        """List all VM snapshots"""
        self.connect()
        
        # info snapshots is an HMP command, so we use human-monitor-command
        cmd = {
            "execute": "human-monitor-command",
            "arguments": {"command-line": "info snapshots"}
        }
        
        self._send(cmd)
        response = self._receive()
        
        if response and "return" in response:
            # Parse the HMP output
            return {"snapshots": response["return"]}
        elif response and "error" in response:
            raise Exception(response["error"].get("desc", str(response["error"])))
        else:
            raise Exception("Invalid response from QMP")

# Global QGA and QMP client instances
qga = QGAClient(QGA_SOCKET)
qmp = QMPClient(QMP_SOCKET)

@app.route('/api/ping', methods=['GET'])
def ping():
    """Simple ping endpoint without QGA"""
    return jsonify({"status": "ok", "message": "API server is running"})

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    try:
        qga.connect()
        return jsonify({"status": "healthy", "qga": "connected"})
    except Exception as e:
        return jsonify({"status": "unhealthy", "error": str(e)}), 503

@app.route('/api/info', methods=['GET'])
def get_info():
    """Get VM information"""
    try:
        info = qga.get_info()
        return jsonify(info)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/execute', methods=['POST'])
def execute_command():
    """Execute command in VM - Body: {"command": "cmd.exe", "args": ["/c", "echo test"]}"""
    try:
        data = request.json
        command = data.get('command')
        args = data.get('args', [])
        env = data.get('env')
        input_data = data.get('input')
        
        if not command:
            return jsonify({"error": "command is required"}), 400
        
        result = qga.execute(command, args, env, input_data)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/execute/status/<int:pid>', methods=['GET'])
def get_exec_status(pid):
    """Get command execution status"""
    try:
        result = qga.get_exec_status(pid)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/files/read', methods=['POST'])
def read_file():
    """Read file from VM - Body: {"path": "C:\\\\path\\\\to\\\\file.txt"}"""
    try:
        data = request.json
        path = data.get('path')
        
        if not path:
            return jsonify({"error": "path is required"}), 400
        
        content = qga.read_file(path)
        return jsonify({"content": content})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/files/write', methods=['POST'])
def write_file():
    """Write file to VM - Body: {"path": "C:\\\\test.txt", "content": "data"}"""
    try:
        data = request.json
        path = data.get('path')
        content = data.get('content')
        
        if not path or content is None:
            return jsonify({"error": "path and content are required"}), 400
        
        result = qga.write_file(path, content)
        return jsonify({"success": True, "bytes_written": result.get('count', 0)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/clipboard/set', methods=['POST'])
def set_clipboard():
    """Set clipboard content in VM - Body: {"content": "text"}"""
    try:
        data = request.json
        content = data.get('content', '')
        
        # Escape single quotes for PowerShell
        escaped = content.replace("'", "''")
        
        # Use PowerShell to set clipboard
        ps_cmd = f"Set-Clipboard -Value '{escaped}'"
        result = qga.execute('powershell.exe', ['-Command', ps_cmd])
        
        return jsonify({"success": True, "pid": result.get('pid')})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/clipboard/get', methods=['GET'])
def get_clipboard():
    """Get clipboard content from VM"""
    try:
        result = qga.execute('powershell.exe', ['-Command', 'Get-Clipboard'])
        pid = result.get('pid')
        
        # Wait briefly for command to complete
        import time
        time.sleep(0.5)
        
        status = qga.get_exec_status(pid)
        
        return jsonify({
            "content": status.get('stdout', '').strip(),
            "exited": status.get('exited', False)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/qmp/savevm', methods=['POST'])
def qmp_savevm():
    """Create VM snapshot - Body: {"name": "snapshot-name"}"""
    try:
        data = request.json
        snapshot_name = data.get('name')
        
        if not snapshot_name:
            return jsonify({"error": "snapshot name is required"}), 400
        
        result = qmp.savevm(snapshot_name)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/qmp/loadvm', methods=['POST'])
def qmp_loadvm():
    """Restore VM snapshot - Body: {"name": "snapshot-name"}"""
    try:
        data = request.json
        snapshot_name = data.get('name')
        
        if not snapshot_name:
            return jsonify({"error": "snapshot name is required"}), 400
        
        result = qmp.loadvm(snapshot_name)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/qmp/delvm', methods=['DELETE'])
def qmp_delvm():
    """Delete VM snapshot - Body: {"name": "snapshot-name"}"""
    try:
        data = request.json
        snapshot_name = data.get('name')
        
        if not snapshot_name:
            return jsonify({"error": "snapshot name is required"}), 400
        
        result = qmp.delvm(snapshot_name)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/qmp/snapshots', methods=['GET'])
def qmp_snapshots():
    """List all VM snapshots"""
    try:
        snapshots = qmp.query_snapshots()
        return jsonify({"snapshots": snapshots})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/desktop-ready', methods=['GET'])
def desktop_ready():
    """Check if Windows desktop is ready - simplified detection
    
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
        # Note: QGA commands run as SYSTEM, so we can't check current user identity.
        # Instead, we check if explorer.exe is running in a user session (SessionId != 0).
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
            result = qga.execute('powershell.exe', ['-Command', ps_cmd])
            pid = result.get('pid')
            
            if not pid:
                return jsonify({
                    "ready": False,
                    "error": "QGA execute failed - no PID returned",
                    "details": "Could not start PowerShell command via QGA"
                }), 500
        except Exception as e:
            return jsonify({
                "ready": False,
                "error": f"QGA execute failed: {str(e)}",
                "details": "Failed to communicate with QEMU Guest Agent"
            }), 500
        
        # Wait for command to complete (up to 5 seconds for more reliability)
        import time
        max_wait = 50  # 50 * 0.1 = 5 seconds
        for i in range(max_wait):
            time.sleep(0.1)
            try:
                status = qga.get_exec_status(pid)
                
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
                                return jsonify({
                                    "ready": True,
                                    "explorer_running": True
                                })
                        except json.JSONDecodeError:
                            # If output doesn't parse, check if stdout indicates success
                            if stdout and 'success' in stdout.lower():
                                return jsonify({
                                    "ready": True,
                                    "explorer_running": True
                                })
                    
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
                    
                    return jsonify({
                        "ready": False,
                        "explorer_running": False,
                        "error": error_msg,
                        "details": error_details if error_details else "Desktop readiness checks failed"
                    }), 200  # Return 200 even on failure so error details are available
                    
            except Exception as e:
                # If get_exec_status fails, continue waiting (might be race condition)
                if i == max_wait - 1:
                    return jsonify({
                        "ready": False,
                        "explorer_running": False,
                        "error": f"Failed to get command status: {str(e)}",
                        "details": "Command may still be running or QGA communication failed"
                    }), 500
        
        # Timeout case
        return jsonify({
            "ready": False,
            "explorer_running": False,
            "error": "Command execution timeout (5 seconds)",
            "details": "PowerShell command did not complete within timeout period"
        }), 200
        
    except Exception as e:
        # Catch-all for any unexpected errors
        return jsonify({
            "ready": False,
            "explorer_running": False,
            "error": f"Unexpected error: {str(e)}",
            "details": f"Exception type: {type(e).__name__}"
        }), 500

if __name__ == '__main__':
    # Use waitress production server instead of Flask development server
    from waitress import serve
    print(f" * Running on http://0.0.0.0:8007")
    serve(app, host='0.0.0.0', port=8007, threads=6)

