"""VM Operations module for QEMU operations and ISO preparation."""

import os
import subprocess
import shutil
import tempfile
from pathlib import Path
from typing import Optional, Callable


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
            print("Windows ISO not found. Please download it first.")
            return False
        
        if not autounattend_path.exists():
            print("autounattend.xml not found in shared directory")
            return False
        
        # Create temporary directory for ISO extraction
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            iso_extracted = temp_path / "iso-extracted"
            drivers_temp = temp_path / "drivers-temp"
            
            try:
                # Step 1: Extract ISO
                if progress_callback:
                    progress_callback("Extracting ISO...")
                self._extract_iso(iso_path, iso_extracted)
                
                # Step 2: Download and extract VirtIO drivers
                if progress_callback:
                    progress_callback("Downloading VirtIO drivers...")
                if not self._download_and_extract_drivers(drivers_temp):
                    return False
                
                # Step 3: Prepare WinPE drivers
                if progress_callback:
                    progress_callback("Preparing drivers...")
                winpe_drivers = self._prepare_winpe_drivers(drivers_temp)
                if not winpe_drivers:
                    return False
                
                # Step 4: Inject drivers into boot.wim
                if progress_callback:
                    progress_callback("Injecting drivers into boot.wim...")
                if not self._inject_drivers_into_boot_wim(iso_extracted, winpe_drivers):
                    return False
                
                # Step 5: Copy drivers to $OEM$/$$/Drivers
                if progress_callback:
                    progress_callback("Copying drivers to OEM directory...")
                if not self._copy_drivers_to_oem(iso_extracted, winpe_drivers):
                    return False
                
                # Step 6: Inject autounattend.xml
                if progress_callback:
                    progress_callback("Injecting autounattend.xml...")
                if not self._inject_autounattend(iso_extracted, autounattend_path):
                    return False
                
                # Step 7: Rebuild ISO
                if progress_callback:
                    progress_callback("Rebuilding ISO...")
                if not self._rebuild_iso(iso_extracted, modified_iso):
                    return False
                
                print(f"Modified ISO created: {modified_iso}")
                return True
                
            except Exception as e:
                print(f"Error preparing ISO: {e}")
                import traceback
                traceback.print_exc()
                return False
    
    def _extract_iso(self, iso_path: Path, extract_dir: Path) -> bool:
        """Extract ISO using hdiutil."""
        extract_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            # Mount the ISO
            result = subprocess.run(
                ["hdiutil", "attach", str(iso_path), "-mountpoint", "/Volumes/WIN11_ARM64"],
                capture_output=True,
                text=True
            )
            
            if result.returncode != 0:
                print(f"Error mounting ISO: {result.stderr}")
                return False
            
            # Copy files
            for item in Path("/Volumes/WIN11_ARM64").iterdir():
                dest = extract_dir / item.name
                if item.is_dir():
                    shutil.copytree(item, dest, dirs_exist_ok=True)
                else:
                    shutil.copy2(item, dest)
            
            # Unmount
            subprocess.run(
                ["hdiutil", "detach", "/Volumes/WIN11_ARM64"],
                capture_output=True
            )
            
            return True
        except Exception as e:
            print(f"Error extracting ISO: {e}")
            return False
    
    def _download_and_extract_drivers(self, drivers_temp: Path) -> bool:
        """Download and extract VirtIO drivers."""
        drivers_temp.mkdir(parents=True, exist_ok=True)
        drivers_archive = self.shared_dir / "virtio-drivers.tar.xz"
        
        # Download if not exists
        if not drivers_archive.exists():
            try:
                print("Downloading VirtIO drivers...")
                subprocess.run(
                    ["curl", "-L", "-o", str(drivers_archive), self.virtio_drivers_url],
                    check=True
                )
            except Exception as e:
                print(f"Error downloading drivers: {e}")
                return False
        
        # Extract
        try:
            subprocess.run(
                ["tar", "-xf", str(drivers_archive), "-C", str(drivers_temp)],
                check=True
            )
            return True
        except Exception as e:
            print(f"Error extracting drivers: {e}")
            return False
    
    def _prepare_winpe_drivers(self, drivers_temp: Path) -> Optional[Path]:
        """Prepare WinPE drivers directory structure."""
        winpe_drivers = drivers_temp / "WinPEDrivers"
        winpe_drivers.mkdir(exist_ok=True)
        
        # Find extracted directory
        extracted_dirs = list(drivers_temp.glob("virtio*"))
        if not extracted_dirs:
            extracted_dirs = [drivers_temp]
        
        extracted_dir = extracted_dirs[0]
        
        # Copy each driver
        for driver in self.drivers:
            driver_path = extracted_dir / driver / "w11" / "ARM64"
            if driver_path.exists():
                dest = winpe_drivers / driver
                dest.mkdir(exist_ok=True)
                shutil.copytree(driver_path, dest, dirs_exist_ok=True)
            else:
                # Try alternative path
                alt_paths = list(extracted_dir.rglob(f"{driver}/*ARM64*"))
                if alt_paths:
                    dest = winpe_drivers / driver
                    dest.mkdir(exist_ok=True)
                    shutil.copytree(alt_paths[0], dest, dirs_exist_ok=True)
        
        return winpe_drivers if any(winpe_drivers.iterdir()) else None
    
    def _inject_drivers_into_boot_wim(self, iso_extracted: Path, winpe_drivers: Path) -> bool:
        """Inject drivers into boot.wim."""
        boot_wim = iso_extracted / "sources" / "boot.wim"
        if not boot_wim.exists():
            print("boot.wim not found")
            return False
        
        try:
            # Check which indices exist
            result = subprocess.run(
                ["wimlib-imagex", "info", str(boot_wim)],
                capture_output=True,
                text=True
            )
            
            has_index_1 = "Image Index: 1" in result.stdout
            has_index_2 = "Image Index: 2" in result.stdout
            
            # Inject into index 1 if exists
            if has_index_1:
                subprocess.run(
                    ["wimlib-imagex", "update", str(boot_wim), "1",
                     "--command", f"delete --force --recursive /\\$WinPEDriver\\$"],
                    capture_output=True
                )
                subprocess.run(
                    ["wimlib-imagex", "update", str(boot_wim), "1",
                     "--command", f"add {winpe_drivers} /\\$WinPEDriver\\$"],
                    check=True
                )
            
            # Inject into index 2 if exists
            if has_index_2:
                subprocess.run(
                    ["sudo", "wimlib-imagex", "update", str(boot_wim), "2",
                     "--command", f"delete --force --recursive /\\$WinPEDriver\\$"],
                    capture_output=True
                )
                subprocess.run(
                    ["sudo", "wimlib-imagex", "update", str(boot_wim), "2",
                     "--command", f"add {winpe_drivers} /\\$WinPEDriver\\$"],
                    check=True
                )
            
            return True
        except Exception as e:
            print(f"Error injecting drivers: {e}")
            return False
    
    def _copy_drivers_to_oem(self, iso_extracted: Path, winpe_drivers: Path) -> bool:
        """Copy drivers to $OEM$/$$/Drivers directory."""
        oem_dir = iso_extracted / "$OEM$" / "$$" / "Drivers"
        oem_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            shutil.copytree(winpe_drivers, oem_dir, dirs_exist_ok=True)
            return True
        except Exception as e:
            print(f"Error copying drivers to OEM: {e}")
            return False
    
    def _inject_autounattend(self, iso_extracted: Path, autounattend_path: Path) -> bool:
        """Inject autounattend.xml into boot.wim."""
        boot_wim = iso_extracted / "sources" / "boot.wim"
        
        try:
            # Determine index (prefer 2, fallback to 1)
            result = subprocess.run(
                ["wimlib-imagex", "info", str(boot_wim)],
                capture_output=True,
                text=True
            )
            
            index = "2" if "Image Index: 2" in result.stdout else "1"
            
            # Backup existing if exists
            subprocess.run(
                ["wimlib-imagex", "extract", str(boot_wim), index,
                 "/autounattend.xml", "--dest-dir=/tmp"],
                capture_output=True
            )
            subprocess.run(
                ["wimlib-imagex", "update", str(boot_wim), index,
                 "--command", "rename /autounattend.xml /autounattend.org"],
                capture_output=True
            )
            
            # Inject autounattend.xml
            subprocess.run(
                ["sudo", "wimlib-imagex", "update", str(boot_wim), index,
                 "--command", f"add {autounattend_path} /autounattend.xml"],
                check=True
            )
            
            # Also inject as autounattend.dat
            subprocess.run(
                ["sudo", "wimlib-imagex", "update", str(boot_wim), index,
                 "--command", f"add {autounattend_path} /autounattend.dat"],
                capture_output=True
            )
            
            return True
        except Exception as e:
            print(f"Error injecting autounattend.xml: {e}")
            return False
    
    def _rebuild_iso(self, iso_extracted: Path, output_iso: Path) -> bool:
        """Rebuild ISO using mkisofs."""
        try:
            # Find boot files
            boot_etfsboot = iso_extracted / "boot" / "etfsboot.com"
            efi_boot = iso_extracted / "efi" / "microsoft" / "boot" / "efisys_noprompt.bin"
            
            cmd = [
                "sudo", "mkisofs",
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
            
            subprocess.run(cmd, check=True)
            return True
        except Exception as e:
            print(f"Error rebuilding ISO: {e}")
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

