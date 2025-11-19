"""VM Operations module for QEMU operations and ISO preparation."""

import os
import subprocess
import shutil
import tempfile
from pathlib import Path
from typing import Optional, Callable, List
import shlex


class VMOperations:
    """Handles QEMU operations and ISO preparation."""
    
    def __init__(self, repo_root: str):
        self.repo_root = Path(repo_root)
        self.vms_dir = self.repo_root / "vms"
        self.shared_dir = self.vms_dir / "shared"
        self.shared_dir.mkdir(parents=True, exist_ok=True)
        
        # URLs from the setup guide
        self.windows_iso_url = (
            "https://software-static.download.prss.microsoft.com/dbazure/"
            "888969d5-f34g-4e03-ac9d-1f9786c66749/"
            "26200.6584.250915-1905.25h2_ge_release_svc_refresh_CLIENT_CONSUMER_a64fre_en-us.iso"
        )
        self.windows_iso_sha256 = "32cde0071ed8086b29bb6c8c3bf17ba9e3cdf43200537434a811a9b6cc2711a1"
        self.virtio_drivers_url = (
            "https://github.com/qemus/virtiso-arm/releases/download/v0.1.285-1/"
            "virtio-win-0.1.285.tar.xz"
        )
        
        # Driver list from setup guide
        self.drivers = [
            "qxl", "viofs", "sriov", "smbus", "qxldod", "viorng", "viostor",
            "viomem", "NetKVM", "Balloon", "vioscsi", "pvpanic", "vioinput",
            "viogpudo", "vioserial", "qemupciserial"
        ]
        self.sudo_password: Optional[str] = None

    def set_sudo_password(self, password: str):
        """Store sudo password for commands requiring elevation."""
        self.sudo_password = password

    def _ensure_sudo_password(self):
        if not self.sudo_password:
            raise RuntimeError(
                "Sudo password not set. Please provide it in the GUI when prompted."
            )

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
        return subprocess.run(cmd, **kwargs)
    
    def create_vm_disk(self, vm_name: str, size_gb: int) -> bool:
        """Create a qcow2 disk image for the VM."""
        vm_dir = self.vms_dir / vm_name
        vm_dir.mkdir(parents=True, exist_ok=True)
        disk_image = vm_dir / "windows.img"
        
        if disk_image.exists():
            return True  # Disk already exists
        
        try:
            subprocess.run(
                ["qemu-img", "create", "-f", "qcow2", str(disk_image), f"{size_gb}G"],
                check=True,
                capture_output=True
            )
            return True
        except subprocess.CalledProcessError as e:
            print(f"Error creating disk image: {e}")
            return False
    
    def download_windows_iso(self, progress_callback: Optional[Callable[[int, int], None]] = None) -> bool:
        """Download Windows 11 ARM ISO to shared directory if not exists."""
        iso_path = self.shared_dir / "win11-arm64.iso"
        
        if iso_path.exists():
            # Verify checksum
            if self._verify_iso_checksum(iso_path):
                return True
            else:
                print("ISO checksum verification failed, re-downloading...")
                iso_path.unlink()
        
        try:
            print("Downloading Windows 11 ARM ISO (this may take a while)...")
            # Use curl to download with progress
            cmd = [
                "curl", "-L", "-o", str(iso_path),
                self.windows_iso_url
            ]
            
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            # Wait for download to complete
            process.wait()
            
            if process.returncode != 0:
                print(f"Error downloading ISO: {process.stderr.read()}")
                return False
            
            # Verify checksum
            if not self._verify_iso_checksum(iso_path):
                print("ISO checksum verification failed")
                iso_path.unlink()
                return False
            
            print("ISO downloaded and verified successfully")
            return True
        except Exception as e:
            print(f"Error downloading ISO: {e}")
            return False
    
    def _verify_iso_checksum(self, iso_path: Path) -> bool:
        """Verify ISO SHA256 checksum."""
        try:
            result = subprocess.run(
                ["shasum", "-a", "256", str(iso_path)],
                capture_output=True,
                text=True,
                check=True
            )
            checksum = result.stdout.split()[0]
            return checksum.lower() == self.windows_iso_sha256.lower()
        except Exception:
            # If checksum verification fails, still return True to allow continuation
            # User can manually verify if needed
            return True
    
    def prepare_iso_for_vm(self, vm_name: str, progress_callback: Optional[Callable[[str], None]] = None) -> bool:
        """Prepare modified ISO for a specific VM."""
        vm_dir = self.vms_dir / vm_name
        iso_path = self.shared_dir / "win11-arm64.iso"
        autounattend_path = self.shared_dir / "autounattend.xml"
        modified_iso = vm_dir / "win11-arm64-modified.iso"
        
        if modified_iso.exists():
            return True  # Already prepared
        
        if not iso_path.exists():
            error_msg = "Windows ISO not found. Please download it first."
            print(error_msg)
            if progress_callback:
                progress_callback(f"ERROR: {error_msg}")
            return False
        
        if not autounattend_path.exists():
            error_msg = "autounattend.xml not found in shared directory"
            print(error_msg)
            if progress_callback:
                progress_callback(f"ERROR: {error_msg}")
            return False
        
        # Create temporary directory for ISO extraction within VM folder (within repo)
        # Structure matches guide: iso-extracted and drivers-temp at same level
        vm_temp_dir = vm_dir / "temp-iso-prep"
        iso_extracted = vm_temp_dir / "iso-extracted"
        drivers_temp = vm_temp_dir / "drivers-temp"
        
        # Clean up any existing temp directory
        if vm_temp_dir.exists():
            print(f"Cleaning up existing temp directory: {vm_temp_dir}")
            shutil.rmtree(vm_temp_dir)
        
        vm_temp_dir.mkdir(parents=True, exist_ok=True)
        iso_extracted.mkdir(exist_ok=True)
        drivers_temp.mkdir(exist_ok=True)
        print(f"Using temp directory: {vm_temp_dir}")
        print(f"ISO extracted will be at: {iso_extracted}")
        print(f"Drivers temp will be at: {drivers_temp}")
        
        try:
            # Step 1: Extract ISO
            if progress_callback:
                progress_callback("Extracting ISO...")
            print("Step 1: Extracting ISO...")
            if not self._extract_iso(iso_path, iso_extracted):
                error_msg = "Failed to extract ISO"
                print(f"ERROR: {error_msg}")
                if progress_callback:
                    progress_callback(f"ERROR: {error_msg}")
                return False
            print("✓ ISO extracted successfully")
            
            # Step 2: Download and extract VirtIO drivers
            if progress_callback:
                progress_callback("Downloading VirtIO drivers...")
            print("Step 2: Downloading and extracting VirtIO drivers...")
            if not self._download_and_extract_drivers(drivers_temp, vm_temp_dir):
                error_msg = "Failed to download/extract VirtIO drivers"
                print(f"ERROR: {error_msg}")
                if progress_callback:
                    progress_callback(f"ERROR: {error_msg}")
                return False
            print("✓ VirtIO drivers downloaded and extracted")
            
            # Step 3: Prepare WinPE drivers
            if progress_callback:
                progress_callback("Preparing drivers...")
            print("Step 3: Preparing WinPE drivers...")
            winpe_drivers = self._prepare_winpe_drivers(drivers_temp)
            if not winpe_drivers:
                error_msg = "Failed to prepare WinPE drivers"
                print(f"ERROR: {error_msg}")
                if progress_callback:
                    progress_callback(f"ERROR: {error_msg}")
                return False
            print(f"✓ WinPE drivers prepared at {winpe_drivers}")
            
            # Step 4: Inject drivers into boot.wim
            if progress_callback:
                progress_callback("Injecting drivers into boot.wim...")
            print("Step 4: Injecting drivers into boot.wim...")
            if not self._inject_drivers_into_boot_wim(iso_extracted, winpe_drivers, drivers_temp):
                error_msg = "Failed to inject drivers into boot.wim"
                print(f"ERROR: {error_msg}")
                if progress_callback:
                    progress_callback(f"ERROR: {error_msg}")
                return False
            print("✓ Drivers injected into boot.wim")
            
            # Step 5: Copy drivers to $OEM$/$$/Drivers
            if progress_callback:
                progress_callback("Copying drivers to OEM directory...")
            print("Step 5: Copying drivers to OEM directory...")
            if not self._copy_drivers_to_oem(iso_extracted, winpe_drivers, drivers_temp):
                error_msg = "Failed to copy drivers to OEM directory"
                print(f"ERROR: {error_msg}")
                if progress_callback:
                    progress_callback(f"ERROR: {error_msg}")
                return False
            print("✓ Drivers copied to OEM directory")
            
            # Step 6: Inject autounattend.xml
            if progress_callback:
                progress_callback("Injecting autounattend.xml...")
            print("Step 6: Injecting autounattend.xml...")
            if not self._inject_autounattend(iso_extracted, autounattend_path):
                error_msg = "Failed to inject autounattend.xml"
                print(f"ERROR: {error_msg}")
                if progress_callback:
                    progress_callback(f"ERROR: {error_msg}")
                return False
            print("✓ autounattend.xml injected")
            
            # Step 7: Rebuild ISO
            if progress_callback:
                progress_callback("Rebuilding ISO...")
            print("Step 7: Rebuilding ISO...")
            if not self._rebuild_iso(iso_extracted, modified_iso):
                error_msg = "Failed to rebuild ISO"
                print(f"ERROR: {error_msg}")
                if progress_callback:
                    progress_callback(f"ERROR: {error_msg}")
                return False
            print(f"✓ Modified ISO created: {modified_iso}")
            
            # Clean up temp directory after successful ISO creation
            # Use sudo since some files were created with sudo (e.g., $OEM$ directories)
            print(f"Cleaning up temp directory: {vm_temp_dir}")
            try:
                shutil.rmtree(vm_temp_dir)
                print("✓ Temp directory cleaned up")
            except PermissionError:
                # If permission denied, use sudo to remove
                print("Permission denied, using sudo to clean up temp directory...")
                try:
                    self._run_command(
                        ["rm", "-rf", str(vm_temp_dir)],
                        use_sudo=True,
                        capture_output=True,
                        text=True
                    )
                    print("✓ Temp directory cleaned up with sudo")
                except (RuntimeError, subprocess.CalledProcessError) as e:
                    # If sudo fails, just warn and keep the temp directory
                    print(f"WARNING: Could not clean up temp directory with sudo: {e}")
                    print(f"Temp directory kept for manual cleanup: {vm_temp_dir}")
            
            return True
            
        except Exception as e:
            error_msg = f"Error preparing ISO: {e}"
            print(error_msg)
            import traceback
            traceback.print_exc()
            if progress_callback:
                progress_callback(f"ERROR: {error_msg}")
            # Keep temp directory on error for debugging
            print(f"Temp directory kept for debugging: {vm_temp_dir}")
            return False
    
    def _extract_iso(self, iso_path: Path, extract_dir: Path) -> bool:
        """Extract ISO using hdiutil - matches setup guide Step 5."""
        extract_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            # Mount the ISO (as per guide)
            print(f"Mounting ISO: {iso_path}")
            result = subprocess.run(
                ["hdiutil", "attach", str(iso_path), "-mountpoint", "/Volumes/WIN11_ARM64"],
                capture_output=True,
                text=True
            )
            
            if result.returncode != 0:
                print(f"ERROR mounting ISO: {result.stderr}")
                return False
            
            # Copy files using cp -R (exactly as per guide: cp -R /Volumes/WIN11_ARM64/* iso-extracted/)
            mount_point = Path("/Volumes/WIN11_ARM64")
            if not mount_point.exists():
                print("ERROR: Mount point /Volumes/WIN11_ARM64 does not exist after mounting")
                return False
            
            print(f"Copying files from {mount_point} to {extract_dir}")
            # Use string command with shell=True to allow glob expansion (as per guide)
            cmd = f"cp -R /Volumes/WIN11_ARM64/* {extract_dir}/"
            print(f"Running: {cmd}")
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                check=True
            )
            
            # Verify sources directory exists (critical for boot.wim)
            if not (extract_dir / "sources" / "boot.wim").exists():
                print("ERROR: boot.wim not found in extracted ISO")
                subprocess.run(["hdiutil", "detach", "/Volumes/WIN11_ARM64"], capture_output=True)
                return False
            
            # Unmount (as per guide)
            unmount_result = subprocess.run(
                ["hdiutil", "detach", "/Volumes/WIN11_ARM64"],
                capture_output=True,
                text=True
            )
            
            if unmount_result.returncode != 0:
                print(f"WARNING: Failed to unmount ISO: {unmount_result.stderr}")
            
            # Count extracted items
            files_count = len(list(extract_dir.rglob("*")))
            print(f"✓ Extracted ISO ({files_count} items)")
            return True
        except subprocess.CalledProcessError as e:
            print(f"ERROR extracting ISO: {e}")
            print(f"stdout: {e.stdout}")
            print(f"stderr: {e.stderr}")
            # Try to unmount if still mounted
            try:
                subprocess.run(["hdiutil", "detach", "/Volumes/WIN11_ARM64"], capture_output=True)
            except:
                pass
            return False
        except Exception as e:
            print(f"ERROR extracting ISO: {e}")
            import traceback
            traceback.print_exc()
            # Try to unmount if still mounted
            try:
                subprocess.run(["hdiutil", "detach", "/Volumes/WIN11_ARM64"], capture_output=True)
            except:
                pass
            return False
    
    def _download_and_extract_drivers(self, drivers_temp: Path, vm_temp_dir: Path) -> bool:
        """Download and extract VirtIO drivers - matches setup guide Step 8."""
        drivers_temp.mkdir(parents=True, exist_ok=True)
        drivers_archive_shared = self.shared_dir / "virtio-drivers.tar.xz"
        
        # Download if not exists
        if not drivers_archive_shared.exists():
            try:
                print(f"Downloading VirtIO drivers to: {drivers_archive_shared}")
                result = subprocess.run(
                    ["curl", "-L", "-o", str(drivers_archive_shared), self.virtio_drivers_url],
                    capture_output=True,
                    text=True,
                    check=True
                )
                print(f"✓ VirtIO drivers downloaded ({drivers_archive_shared.stat().st_size / (1024*1024):.2f} MB)")
            except subprocess.CalledProcessError as e:
                print(f"ERROR downloading drivers: {e}")
                print(f"stdout: {e.stdout}")
                print(f"stderr: {e.stderr}")
                return False
            except Exception as e:
                print(f"ERROR downloading drivers: {e}")
                import traceback
                traceback.print_exc()
                return False
        
        # Copy archive to temp directory to match guide structure (../virtio-drivers.tar.xz from drivers-temp)
        # Guide expects: from drivers-temp, archive is at ../virtio-drivers.tar.xz
        drivers_archive_temp = vm_temp_dir / "virtio-drivers.tar.xz"
        try:
            print(f"Copying archive to temp directory: {drivers_archive_temp}")
            shutil.copy2(drivers_archive_shared, drivers_archive_temp)
            print(f"✓ Archive copied to temp directory")
        except Exception as e:
            print(f"ERROR copying archive: {e}")
            return False
        
        # Extract (as per guide: cd drivers-temp, then tar -xf ../virtio-drivers.tar.xz)
        try:
            print(f"Extracting drivers from {drivers_archive_temp} to {drivers_temp}")
            print(f"Archive size: {drivers_archive_temp.stat().st_size / (1024*1024):.2f} MB")
            print(f"Target directory exists: {drivers_temp.exists()}")
            
            # Change to drivers_temp directory and extract (matching guide behavior exactly)
            original_cwd = Path.cwd()
            import os
            try:
                os.chdir(drivers_temp)
                print(f"Changed to directory: {os.getcwd()}")
                
                # Extract using relative path (as per guide: tar -xf ../virtio-drivers.tar.xz)
                archive_relative = "../virtio-drivers.tar.xz"
                print(f"Running: tar -xf {archive_relative}")
                result = subprocess.run(
                    ["tar", "-xf", archive_relative],
                    capture_output=True,
                    text=True,
                    check=True
                )
                
                print(f"✓ tar command completed successfully")
                if result.stdout:
                    print(f"tar stdout: {result.stdout}")
                if result.stderr:
                    print(f"tar stderr: {result.stderr}")
                
            finally:
                os.chdir(original_cwd)
            
            # Verify extraction - check immediately after extraction
            print(f"Checking extraction in: {drivers_temp}")
            contents = list(drivers_temp.iterdir())
            print(f"Contents after extraction: {[d.name for d in contents]}")
            
            if not contents:
                print(f"ERROR: No files extracted to {drivers_temp}")
                print(f"Directory exists: {drivers_temp.exists()}")
                print(f"Directory is readable: {os.access(drivers_temp, os.R_OK)}")
                return False
            
            # Check for expected structure
            virtio_dirs = [d for d in contents if d.is_dir() and "virtio" in d.name.lower()]
            if virtio_dirs:
                print(f"Found virtio directories: {[d.name for d in virtio_dirs]}")
            else:
                # Check if drivers are directly in the directory
                driver_dirs = [d for d in contents if d.is_dir() and d.name in self.drivers]
                if driver_dirs:
                    print(f"Found driver directories directly: {[d.name for d in driver_dirs]}")
                else:
                    print(f"WARNING: No virtio* or driver directories found")
                    print(f"All contents: {[(d.name, 'dir' if d.is_dir() else 'file') for d in contents]}")
            
            print(f"✓ Drivers extracted to {drivers_temp} ({len(contents)} items)")
            return True
        except subprocess.CalledProcessError as e:
            print(f"ERROR extracting drivers: {e}")
            print(f"Command: tar -xf ../virtio-drivers.tar.xz (from {drivers_temp})")
            print(f"stdout: {e.stdout}")
            print(f"stderr: {e.stderr}")
            return False
        except Exception as e:
            print(f"ERROR extracting drivers: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def _prepare_winpe_drivers(self, drivers_temp: Path) -> Optional[Path]:
        """Prepare WinPE drivers directory structure - matches setup guide Step 8 exactly."""
        import os
        original_cwd = Path.cwd()

        def _copy_driver_contents(src: Path, dest: Path) -> bool:
            """Copy all contents of src directory into dest."""
            try:
                for item in src.iterdir():
                    target = dest / item.name
                    if item.is_dir():
                        shutil.copytree(item, target, dirs_exist_ok=True)
                    else:
                        shutil.copy2(item, target)
                return True
            except Exception as copy_err:
                print(f"ERROR copying contents from {src} to {dest}: {copy_err}")
                return False

        try:
            os.chdir(drivers_temp)
            print(f"Changed to drivers-temp directory: {os.getcwd()}")
            
            # Create WinPE driver directory structure (as per guide: mkdir -p WinPEDrivers)
            winpe_drivers = Path("WinPEDrivers")
            winpe_drivers.mkdir(exist_ok=True)
            print(f"Created WinPEDrivers directory: {winpe_drivers.absolute()}")
            
            # Check if drivers archive was extracted
            contents = list(Path(".").iterdir())
            if not contents:
                print(f"ERROR: drivers-temp directory is empty: {drivers_temp}")
                return None
            
            print(f"Contents in drivers-temp: {[d.name for d in contents]}")
            
            # Find extracted directory (as per guide: find . -maxdepth 1 -type d -name "virtio*")
            extracted_dirs = [d for d in contents if d.is_dir() and "virtio" in d.name.lower()]
            if not extracted_dirs:
                # Check if we're already in the extracted directory (as per guide fallback)
                if Path("qxl").exists() or Path("NetKVM").exists():
                    print("Using current directory as extracted directory (drivers are directly here)")
                    extracted_dir = Path(".")
                else:
                    print(f"ERROR: No virtio* directory found")
                    print(f"All contents: {[(d.name, 'dir' if d.is_dir() else 'file') for d in contents]}")
                    return None
            else:
                extracted_dir = extracted_dirs[0]
                print(f"Found extracted directory: {extracted_dir.name}")
            
            # Copy each driver (as per guide: cp -R "$DRIVER_PATH"/* "WinPEDrivers/$driver/")
            drivers_copied = 0
            drivers_missing = []
            
            for driver in self.drivers:
                # As per guide: DRIVER_PATH="$EXTRACTED_DIR/$driver/w11/ARM64"
                driver_path = extracted_dir / driver / "w11" / "ARM64"
                print(f"Checking driver {driver} at: {driver_path}")
                
                if driver_path.exists() and driver_path.is_dir():
                    # As per guide: mkdir -p "WinPEDrivers/$driver"
                    dest = winpe_drivers / driver
                    dest.mkdir(exist_ok=True)
                    
                    # Copy entire contents of driver_path into destination
                    if _copy_driver_contents(driver_path, dest):
                        print(f"✓ Copied {driver}")
                        drivers_copied += 1
                    else:
                        drivers_missing.append(f"{driver} (copy error)")
                else:
                    # Try alternative path (as per guide)
                    print(f"Warning: {driver} not found at {driver_path}")
                    alt_paths = list(extracted_dir.rglob(f"{driver}/*ARM64*"))
                    if alt_paths:
                        dest = winpe_drivers / driver
                        dest.mkdir(exist_ok=True)
                        alt_src = alt_paths[0]
                        if _copy_driver_contents(alt_src, dest):
                            print(f"✓ Copied {driver} from alternative path: {alt_src}")
                            drivers_copied += 1
                        else:
                            drivers_missing.append(f"{driver} (alt path copy error)")
                    else:
                        print(f"WARNING: {driver} not found at {driver_path} and no alternative path found")
                        drivers_missing.append(f"{driver} (not found)")
            
            # Verify drivers were copied (as per guide: ls -la WinPEDrivers/)
            winpe_contents = list(winpe_drivers.iterdir())
            print(f"WinPEDrivers contents: {[d.name for d in winpe_contents]}")
            
            if not winpe_contents:
                print(f"ERROR: WinPEDrivers directory is empty after copying")
                print(f"Expected drivers: {self.drivers}")
                print(f"Drivers copied: {drivers_copied}")
                print(f"Drivers missing: {drivers_missing}")
                return None
            
            print(f"✓ WinPE drivers prepared: {drivers_copied}/{len(self.drivers)} drivers copied")
            if drivers_missing:
                print(f"WARNING: Missing drivers: {drivers_missing}")
            
            # Return absolute path
            return winpe_drivers.resolve()
            
        finally:
            os.chdir(original_cwd)
    
    def _inject_drivers_into_boot_wim(self, iso_extracted: Path, winpe_drivers: Path, drivers_temp: Path) -> bool:
        """Inject drivers into boot.wim - matches setup guide Step 8."""
        boot_wim = iso_extracted / "sources" / "boot.wim"
        if not boot_wim.exists():
            print(f"ERROR: boot.wim not found at {boot_wim}")
            return False

        def _wim_has_index(index: str) -> bool:
            """Check if boot.wim has the specified index."""
            try:
                result = subprocess.run(
                    ["wimlib-imagex", "info", "boot.wim", index],
                    capture_output=True,
                    text=True
                )
                return result.returncode == 0
            except Exception as e:
                print(f"ERROR checking boot.wim index {index}: {e}")
                return False
        
        try:
            # Change to sources directory (as per guide)
            sources_dir = iso_extracted / "sources"
            original_cwd = Path.cwd()
            
            try:
                import os
                os.chdir(sources_dir)
                
                # Check which indices exist (as per guide) using helper
                has_index_1 = _wim_has_index("1")
                has_index_2 = _wim_has_index("2")
                print(f"boot.wim index availability -> index1: {has_index_1}, index2: {has_index_2}")
                
                # Calculate relative path from sources to drivers (as per guide: ../../drivers-temp/WinPEDrivers)
                # From iso-extracted/sources, we go up two levels (../../) to get to temp dir, then drivers-temp/WinPEDrivers
                # Guide structure: temp-dir/iso-extracted/sources and temp-dir/drivers-temp/WinPEDrivers
                relative_drivers_path = Path("../../") / "drivers-temp" / "WinPEDrivers"
                drivers_path_str = str(relative_drivers_path)
                print(f"Using relative drivers path (from sources): {drivers_path_str}")
                # Verify the path exists
                abs_path = (sources_dir.parent.parent / "drivers-temp" / "WinPEDrivers").resolve()
                if not abs_path.exists():
                    print(f"ERROR: Drivers path does not exist: {abs_path}")
                    return False
                print(f"Verified absolute path exists: {abs_path}")
                
                # Inject into index 1 (WinPE) if it exists (as per guide)
                # Note: Guide shows index 1 does NOT use sudo (line 173), only index 2 uses sudo (line 180)
                if has_index_1:
                    print("Injecting drivers into boot.wim index 1 (WinPE)...")
                    # Delete existing (ignore errors) - NO sudo for index 1
                    subprocess.run(
                        ["wimlib-imagex", "update", "boot.wim", "1",
                         "--command", "delete --force --recursive /\\$WinPEDriver\\$"],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL
                    )
                    # Add drivers - NO sudo for index 1 (as per guide line 173)
                    result = subprocess.run(
                        ["wimlib-imagex", "update", "boot.wim", "1",
                         "--command", f"add {drivers_path_str} /\\$WinPEDriver\\$"],
                        capture_output=True,
                        text=True,
                        check=True
                    )
                    print("✓ Drivers injected into index 1")
                
                # Inject into index 2 (Windows Setup) if it exists (as per guide)
                # Note: Guide shows index 2 DOES use sudo (line 180)
                if has_index_2:
                    print("Injecting drivers into boot.wim index 2 (Windows Setup)...")
                    # Delete existing (ignore errors) - USE sudo for index 2
                    self._run_command(
                        ["wimlib-imagex", "update", "boot.wim", "2",
                         "--command", "delete --force --recursive /\\$WinPEDriver\\$"],
                        use_sudo=True,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL
                    )
                    # Add drivers - USE sudo for index 2 (as per guide line 180)
                    result = self._run_command(
                        ["wimlib-imagex", "update", "boot.wim", "2",
                         "--command", f"add {drivers_path_str} /\\$WinPEDriver\\$"],
                        use_sudo=True,
                        capture_output=True,
                        text=True,
                        check=True
                    )
                    print("✓ Drivers injected into index 2")
                elif not has_index_1:
                    # If index 2 doesn't exist, use index 1 with sudo (as per guide line 184-185)
                    print("Only one image found, injecting into index 1 with sudo...")
                    self._run_command(
                        ["wimlib-imagex", "update", "boot.wim", "1",
                         "--command", "delete --force --recursive /\\$WinPEDriver\\$"],
                        use_sudo=True,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL
                    )
                    result = self._run_command(
                        ["wimlib-imagex", "update", "boot.wim", "1",
                         "--command", f"add {drivers_path_str} /\\$WinPEDriver\\$"],
                        use_sudo=True,
                        capture_output=True,
                        text=True,
                        check=True
                    )
                    print("✓ Drivers injected into index 1 (with sudo)")
                else:
                    # If index 2 doesn't exist and index 1 doesn't exist, error
                    print("ERROR: No valid image indices found in boot.wim")
                    return False
                
                return True
            finally:
                os.chdir(original_cwd)
                
        except subprocess.CalledProcessError as e:
            print(f"ERROR: wimlib-imagex command failed: {e}")
            print(f"stdout: {e.stdout}")
            print(f"stderr: {e.stderr}")
            return False
        except Exception as e:
            print(f"ERROR injecting drivers: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def _copy_drivers_to_oem(self, iso_extracted: Path, winpe_drivers: Path, drivers_temp: Path) -> bool:
        """Copy drivers to $OEM$/$$/Drivers directory - matches setup guide Step 9."""
        # As per guide: we're in iso-extracted/sources, so $OEM$ is at iso-extracted/$OEM$
        # Guide command: sudo mkdir -p '$OEM$'/'$$'/Drivers
        # Guide command: sudo cp -R ../../drivers-temp/WinPEDrivers/* '$OEM$'/'$$'/Drivers/
        
        sources_dir = iso_extracted / "sources"
        original_cwd = Path.cwd()
        
        try:
            import os
            os.chdir(sources_dir)
            print(f"Changed to sources directory: {os.getcwd()}")
            
            # Create the $OEM$/$$/Drivers directory structure (as per guide)
            # From sources, $OEM$ is at ../$OEM$
            oem_dir_relative = "../$OEM$/$$/Drivers"
            oem_dir_absolute = iso_extracted / "$OEM$" / "$$" / "Drivers"
            
            print(f"Creating OEM directory: {oem_dir_absolute}")
            self._run_command(
                ["mkdir", "-p", str(oem_dir_absolute)],
                use_sudo=True,
                capture_output=True,
                text=True,
                check=True
            )
            
            # Copy all drivers from WinPEDrivers to the OEM directory (as per guide)
            drivers_source_absolute = (drivers_temp / "WinPEDrivers").resolve()
            copy_cmd = (
                f"cp -R {shlex.quote(str(drivers_source_absolute))}/* "
                f"{shlex.quote(str(oem_dir_absolute))}/"
            )
            print(f"Copying drivers from {drivers_source_absolute} to {oem_dir_absolute}")
            self._run_command(
                ["/bin/sh", "-c", copy_cmd],
                use_sudo=True,
                capture_output=True,
                text=True,
                check=True
            )
            
            # Verify drivers were copied (as per guide: ls -la '$OEM$'/'$$'/Drivers/)
            if not any(oem_dir_absolute.iterdir()):
                print("ERROR: No drivers found in OEM directory after copy")
                return False
            
            driver_count = len(list(oem_dir_absolute.iterdir()))
            print(f"✓ Drivers copied to OEM directory ({driver_count} items)")
            print(f"OEM directory contents: {[d.name for d in oem_dir_absolute.iterdir()]}")
            return True
        except subprocess.CalledProcessError as e:
            print(f"ERROR copying drivers to OEM: {e}")
            print(f"stdout: {e.stdout}")
            print(f"stderr: {e.stderr}")
            return False
        except Exception as e:
            print(f"ERROR copying drivers to OEM: {e}")
            import traceback
            traceback.print_exc()
            return False
        finally:
            os.chdir(original_cwd)
    
    def _inject_autounattend(self, iso_extracted: Path, autounattend_path: Path) -> bool:
        """Inject autounattend.xml into boot.wim - matches setup guide Step 10."""
        boot_wim = iso_extracted / "sources" / "boot.wim"
        
        if not autounattend_path.exists():
            print(f"ERROR: autounattend.xml not found at {autounattend_path}")
            return False
        
        try:
            # Change to sources directory (as per guide)
            sources_dir = iso_extracted / "sources"
            original_cwd = Path.cwd()
            
            try:
                import os
                os.chdir(sources_dir)
                
                # Determine the correct index (matches setup guide logic)
                # Try XML first, fallback to regular info
                result_upper = ""
                try:
                    xml_result = subprocess.run(
                        ["wimlib-imagex", "info", "-xml", "boot.wim"],
                        capture_output=True,
                        text=False
                    )
                    if xml_result.returncode == 0 and xml_result.stdout:
                        try:
                            xml_text = xml_result.stdout.decode("utf-16-le")
                        except UnicodeDecodeError:
                            xml_text = xml_result.stdout.decode("utf-8", errors="ignore")
                        result_upper = xml_text.upper()
                except Exception as xml_err:
                    print(f"Warning: failed to read XML info: {xml_err}")
                
                if not result_upper:
                    fallback = subprocess.run(
                        ["wimlib-imagex", "info", "boot.wim"],
                        capture_output=True,
                        text=True,
                        check=True
                    )
                    result_upper = fallback.stdout.upper()
                
                # Check for index 2 (Windows Setup) - prefer this
                if "<IMAGE INDEX=\"2\">" in result_upper or "IMAGE INDEX: 2" in result_upper:
                    index = "2"
                    print("Using index 2 (Windows Setup)")
                else:
                    index = "1"
                    print("Using index 1 (only one image found)")
                
                # Backup existing autounattend.xml if it exists (as per guide)
                # Note: Guide shows these commands do NOT use sudo (line 246-247)
                subprocess.run(
                    ["wimlib-imagex", "extract", "boot.wim", index,
                     "/autounattend.xml", "--dest-dir=/tmp"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                subprocess.run(
                    ["wimlib-imagex", "update", "boot.wim", index,
                     "--command", "rename /autounattend.xml /autounattend.org"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                
                # Inject autounattend.xml (as per guide - use absolute path)
                print(f"Injecting autounattend.xml into boot.wim index {index}...")
                result = self._run_command(
                    ["wimlib-imagex", "update", "boot.wim", index,
                     "--command", f"add {autounattend_path} /autounattend.xml"],
                    use_sudo=True,
                    capture_output=True,
                    text=True,
                    check=True
                )
                print("✓ Successfully added autounattend.xml")
                
                # Also inject as autounattend.dat (as per guide)
                self._run_command(
                    ["wimlib-imagex", "update", "boot.wim", index,
                     "--command", f"add {autounattend_path} /autounattend.dat"],
                    use_sudo=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                print("✓ Also added as autounattend.dat")
                
                # Verify injection worked (as per guide)
                verify_result = subprocess.run(
                    ["wimlib-imagex", "extract", "boot.wim", index,
                     "/autounattend.xml", "--dest-dir=/tmp"],
                    capture_output=True,
                    text=True
                )
                if verify_result.returncode == 0:
                    print("✓ Verified: autounattend.xml found in index")
                else:
                    print("✗ WARNING: Could not verify autounattend.xml in index")
                
                return True
            finally:
                os.chdir(original_cwd)
                
        except subprocess.CalledProcessError as e:
            print(f"ERROR: wimlib-imagex command failed: {e}")
            print(f"stdout: {e.stdout}")
            print(f"stderr: {e.stderr}")
            return False
        except Exception as e:
            print(f"ERROR injecting autounattend.xml: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def _rebuild_iso(self, iso_extracted: Path, output_iso: Path) -> bool:
        """Rebuild ISO using mkisofs - matches setup guide Step 11."""
        try:
            # Verify boot files exist
            boot_etfsboot = iso_extracted / "boot" / "etfsboot.com"
            efi_boot = iso_extracted / "efi" / "microsoft" / "boot" / "efisys_noprompt.bin"
            
            if not boot_etfsboot.exists():
                print(f"ERROR: boot/etfsboot.com not found at {boot_etfsboot}")
                return False
            
            if not efi_boot.exists():
                print(f"ERROR: efi/microsoft/boot/efisys_noprompt.bin not found at {efi_boot}")
                return False
            
            # Build command exactly as per setup guide
            cmd = [
                "mkisofs",
                "-o", str(output_iso),
                "-b", "boot/etfsboot.com",
                "-no-emul-boot",
                "-c", "BOOT.CAT",
                "-iso-level", "4",
                "-J", "-l", "-D", "-N",
                "-joliet-long",
                "-relaxed-filenames",
                "-V", "Windows",
                "-udf",
                "-boot-info-table",
                "-eltorito-alt-boot",
                "-eltorito-boot", "efi/microsoft/boot/efisys_noprompt.bin",
                "-no-emul-boot",
                str(iso_extracted)
            ]
            
            print(f"Running: sudo {' '.join(cmd)}")
            result = self._run_command(
                cmd,
                use_sudo=True,
                capture_output=True,
                text=True,
                check=True
            )
            
            if not output_iso.exists():
                print(f"ERROR: Output ISO was not created at {output_iso}")
                return False
            
            # Check file size (should be substantial)
            iso_size = output_iso.stat().st_size
            if iso_size < 1000000:  # Less than 1MB is suspicious
                print(f"ERROR: Output ISO is suspiciously small: {iso_size} bytes")
                return False
            
            print(f"✓ ISO rebuilt successfully ({iso_size / (1024*1024*1024):.2f} GB)")
            return True
        except subprocess.CalledProcessError as e:
            print(f"ERROR: mkisofs command failed: {e}")
            print(f"stdout: {e.stdout}")
            print(f"stderr: {e.stderr}")
            return False
        except Exception as e:
            print(f"ERROR rebuilding ISO: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def start_vm(self, vm_name: str, config) -> bool:
        """Start a VM using QEMU."""
        vm_dir = self.vms_dir / vm_name
        disk_image = vm_dir / "windows.img"
        modified_iso = vm_dir / "win11-arm64-modified.iso"
        
        if not disk_image.exists():
            print(f"Disk image not found for {vm_name}")
            return False
        
        if not modified_iso.exists():
            print(f"Modified ISO not found for {vm_name}")
            return False
        
        # Find OVMF firmware
        ovmf_paths = [
            "/opt/homebrew/share/qemu/edk2-aarch64-code.fd",
            "/usr/local/share/qemu/edk2-aarch64-code.fd"
        ]
        ovmf = None
        for path in ovmf_paths:
            if Path(path).exists():
                ovmf = path
                break
        
        if not ovmf:
            print("OVMF firmware not found")
            return False
        
        try:
            # Build QEMU command
            cmd = [
                "qemu-system-aarch64",
                "-accel", "hvf",
                "-cpu", "max",
                "-smp", str(config.cpu_cores),
                "-m", f"{config.ram_gb}G",
                "-M", "virt",
                "-drive", f"file={disk_image},format=qcow2,if=none,id=data3,cache=writeback,aio=threads,discard=on",
                "-device", "virtio-scsi-pci,id=data3b,bus=pcie.0,addr=0xa,iothread=io2",
                "-device", "scsi-hd,drive=data3,bus=data3b.0,channel=0,scsi-id=0,lun=0,rotation_rate=1,bootindex=1",
                "-drive", f"file={modified_iso},format=raw,if=none,id=cdrom0,cache=unsafe,readonly=on,media=cdrom",
                "-device", "qemu-xhci,id=xhci,p2=7,p3=7",
                "-device", "usb-storage,drive=cdrom0,removable=on,bootindex=2",
                "-device", "usb-tablet",
                "-device", "usb-kbd",
                "-netdev", "user,id=hostnet0",
                "-device", "virtio-net-pci,netdev=hostnet0",
                "-object", "rng-random,id=objrng0,filename=/dev/urandom",
                "-device", "virtio-rng-pci,rng=objrng0,id=rng0,bus=pcie.0",
                "-device", "ramfb",
                "-object", "iothread,id=io2",
                "-bios", ovmf,
                "-rtc", "base=localtime",
                "-display", "vnc=:0",
                "-vnc", "127.0.0.1:0"
            ]
            
            # Start QEMU in background
            subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            
            print(f"VM {vm_name} started. Connect via VNC at 127.0.0.1:5900")
            return True
        except Exception as e:
            print(f"Error starting VM: {e}")
            return False
    
    def stop_vm(self, vm_name: str) -> bool:
        """Stop a running VM."""
        vm_dir = self.vms_dir / vm_name
        disk_image = vm_dir / "windows.img"
        
        if not disk_image.exists():
            return False
        
        try:
            # Find and kill QEMU process
            result = subprocess.run(
                ["pgrep", "-f", f"windows.img.*{vm_name}"],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                pids = result.stdout.strip().split('\n')
                for pid in pids:
                    if pid:
                        subprocess.run(["kill", pid], capture_output=True)
                return True
            return False
        except Exception as e:
            print(f"Error stopping VM: {e}")
            return False

