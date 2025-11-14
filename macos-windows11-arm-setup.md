# Windows 11 ARM VM Setup Guide for M1 MacBook

This guide provides step-by-step instructions to set up and run Windows 11 ARM on your M1 MacBook using QEMU with HVF (Hypervisor.framework) acceleration. All commands are ready to copy and paste.

## Prerequisites

Ensure you have Homebrew installed, then install the required tools:

```bash
brew install qemu wimlib cdrtools
```

**Note:** `cdrtools` provides `mkisofs` which is used to rebuild the ISO. On macOS, `genisoimage` is not available, but `mkisofs` (from `cdrtools`) is functionally equivalent.

## Step 1: Create Working Directory

```bash
mkdir -p ~/windows-vm
cd ~/windows-vm
```

## Step 2: Download Windows 11 ARM ISO

Download the Windows 11 ARM64 ISO directly from Microsoft:

```bash
curl -L -o win11-arm64.iso \
  "https://software-static.download.prss.microsoft.com/dbazure/888969d5-f34g-4e03-ac9d-1f9786c66749/26200.6584.250915-1905.25h2_ge_release_svc_refresh_CLIENT_CONSUMER_a64fre_en-us.iso"
```

Verify the download (optional but recommended):

```bash
echo "32cde0071ed8086b29bb6c8c3bf17ba9e3cdf43200537434a811a9b6cc2711a1  win11-arm64.iso" | shasum -a 256 -c
```

Expected output: `win11-arm64.iso: OK`

## Step 3: Download VirtIO Drivers

Download the VirtIO drivers for ARM64:

```bash
curl -L -o virtio-drivers.tar.xz \
  "https://github.com/qemus/virtiso-arm/releases/download/v0.1.285-1/virtio-win-0.1.285.tar.xz"
```

Extract the drivers:

```bash
tar -xf virtio-drivers.tar.xz
```

## Step 4: Create Disk Image

Create a 64GB disk image for Windows:

```bash
qemu-img create -f qcow2 windows.img 64G
```

## Step 5: Extract Windows ISO

Create a directory to extract the ISO:

```bash
mkdir -p iso-extracted
```

Extract the ISO using hdiutil (built into macOS):

```bash
hdiutil attach win11-arm64.iso -mountpoint /Volumes/WIN11_ARM64
cp -R /Volumes/WIN11_ARM64/* iso-extracted/
hdiutil detach /Volumes/WIN11_ARM64
```

**Alternative:** If you have 7z installed (`brew install p7zip`):

```bash
7z x win11-arm64.iso -oiso-extracted
```

## Step 6: Download and Prepare OVMF Firmware

Download ARM64 OVMF firmware. You can get it from the QEMU package or download separately:

```bash
# OVMF firmware is typically included with QEMU
# Check if it exists:
ls /opt/homebrew/share/qemu/edk2-aarch64-code.fd 2>/dev/null || \
ls /usr/local/share/qemu/edk2-aarch64-code.fd 2>/dev/null || \
echo "OVMF firmware not found in standard locations"

# If not found, you may need to download it separately or use QEMU's built-in UEFI
```

For this guide, we'll use QEMU's built-in UEFI support which should work on macOS.

## Step 7: Prepare autounattend.xml

Create the autounattend.xml file for unattended installation. Save this as `autounattend.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<unattend xmlns="urn:schemas-microsoft-com:unattend" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
  <settings pass="windowsPE">
    <component name="Microsoft-Windows-International-Core-WinPE" processorArchitecture="arm64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <SetupUILanguage>
        <UILanguage>en-US</UILanguage>
      </SetupUILanguage>
      <InputLocale>0409:00000409</InputLocale>
      <SystemLocale>en-US</SystemLocale>
      <UILanguage>en-US</UILanguage>
      <UserLocale>en-US</UserLocale>
    </component>
    <component name="Microsoft-Windows-Setup" processorArchitecture="arm64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <DiskConfiguration>
        <Disk wcm:action="add">
          <DiskID>0</DiskID>
          <WillWipeDisk>true</WillWipeDisk>
          <CreatePartitions>
            <CreatePartition wcm:action="add">
              <Order>1</Order>
              <Type>EFI</Type>
              <Size>128</Size>
            </CreatePartition>
            <CreatePartition wcm:action="add">
              <Order>2</Order>
              <Type>MSR</Type>
              <Size>128</Size>
            </CreatePartition>
            <CreatePartition wcm:action="add">
              <Order>3</Order>
              <Type>Primary</Type>
              <Extend>true</Extend>
            </CreatePartition>
          </CreatePartitions>
          <ModifyPartitions>
            <ModifyPartition wcm:action="add">
              <Order>1</Order>
              <PartitionID>1</PartitionID>
              <Label>System</Label>
              <Format>FAT32</Format>
            </ModifyPartition>
            <ModifyPartition wcm:action="add">
              <Order>2</Order>
              <PartitionID>2</PartitionID>
            </ModifyPartition>
            <ModifyPartition wcm:action="add">
              <Order>3</Order>
              <PartitionID>3</PartitionID>
              <Label>Windows</Label>
              <Letter>C</Letter>
              <Format>NTFS</Format>
            </ModifyPartition>
          </ModifyPartitions>
        </Disk>
      </DiskConfiguration>
      <ImageInstall>
        <OSImage>
          <InstallTo>
            <DiskID>0</DiskID>
            <PartitionID>3</PartitionID>
          </InstallTo>
          <InstallToAvailablePartition>false</InstallToAvailablePartition>
        </OSImage>
      </ImageInstall>
      <DynamicUpdate>
        <Enable>true</Enable>
        <WillShowUI>Never</WillShowUI>
      </DynamicUpdate>
      <UpgradeData>
        <Upgrade>false</Upgrade>
        <WillShowUI>Never</WillShowUI>
      </UpgradeData>
      <UserData>
        <AcceptEula>true</AcceptEula>
        <FullName>Docker</FullName>
        <Organization>Windows for Docker</Organization>
        <ProductKey>
          <Key>VK7JG-NPHTM-C97JM-9MPGT-3V66T</Key>
          <WillShowUI>OnError</WillShowUI>
        </ProductKey>
      </UserData>
      <EnableFirewall>false</EnableFirewall>
      <Diagnostics>
        <OptIn>false</OptIn>
      </Diagnostics>
      <RunSynchronous>
        <RunSynchronousCommand wcm:action="add">
          <Order>1</Order>
          <Path>reg.exe add "HKLM\SYSTEM\Setup\LabConfig" /v BypassTPMCheck /t REG_DWORD /d 1 /f</Path>
        </RunSynchronousCommand>
        <RunSynchronousCommand wcm:action="add">
          <Order>2</Order>
          <Path>reg.exe add "HKLM\SYSTEM\Setup\LabConfig" /v BypassSecureBootCheck /t REG_DWORD /d 1 /f</Path>
        </RunSynchronousCommand>
        <RunSynchronousCommand wcm:action="add">
          <Order>3</Order>
          <Path>reg.exe add "HKLM\SYSTEM\Setup\LabConfig" /v BypassRAMCheck /t REG_DWORD /d 1 /f</Path>
        </RunSynchronousCommand>
        <RunSynchronousCommand wcm:action="add">
          <Order>4</Order>
          <Path>reg.exe add "HKLM\SYSTEM\Setup\MoSetup" /v AllowUpgradesWithUnsupportedTPMOrCPU /t REG_DWORD /d 1 /f</Path>
        </RunSynchronousCommand>
      </RunSynchronous>
    </component>
  </settings>
  <settings pass="offlineServicing">
    <component name="Microsoft-Windows-LUA-Settings" processorArchitecture="arm64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <EnableLUA>false</EnableLUA>
    </component>
  </settings>
  <settings pass="generalize">
    <component name="Microsoft-Windows-PnPSysprep" processorArchitecture="arm64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <PersistAllDeviceInstalls>true</PersistAllDeviceInstalls>
    </component>
    <component name="Microsoft-Windows-Security-SPP" processorArchitecture="arm64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <SkipRearm>1</SkipRearm>
    </component>
  </settings>
  <settings pass="specialize">
    <component name="Microsoft-Windows-Security-SPP-UX" processorArchitecture="arm64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <SkipAutoActivation>true</SkipAutoActivation>
    </component>
    <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="arm64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <ComputerName>*</ComputerName>
      <OEMInformation>
        <Manufacturer>Dockur</Manufacturer>
        <Model>Windows for Docker</Model>
        <SupportHours>24/7</SupportHours>
        <SupportPhone />
        <SupportProvider>Dockur</SupportProvider>
        <SupportURL>https://github.com/dockur/windows-arm/issues</SupportURL>
      </OEMInformation>
      <OEMName>Windows for Docker</OEMName>
    </component>
    <component name="Microsoft-Windows-ErrorReportingCore" processorArchitecture="arm64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <DisableWER>1</DisableWER>
    </component>
    <component name="Microsoft-Windows-International-Core" processorArchitecture="arm64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <InputLocale>0409:00000409</InputLocale>
      <SystemLocale>en-US</SystemLocale>
      <UILanguage>en-US</UILanguage>
      <UserLocale>en-US</UserLocale>
    </component>
    <component name="Microsoft-Windows-TerminalServices-LocalSessionManager" processorArchitecture="arm64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <fDenyTSConnections>false</fDenyTSConnections>
    </component>
    <component name="Microsoft-Windows-TerminalServices-RDP-WinStationExtensions" processorArchitecture="arm64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <UserAuthentication>0</UserAuthentication>
    </component>
    <component name="Networking-MPSSVC-Svc" processorArchitecture="arm64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <FirewallGroups>
        <FirewallGroup wcm:action="add" wcm:keyValue="RemoteDesktop">
          <Active>true</Active>
          <Profile>all</Profile>
          <Group>@FirewallAPI.dll,-28752</Group>
        </FirewallGroup>
      </FirewallGroups>
    </component>
  </settings>
  <settings pass="oobeSystem">
    <component name="Microsoft-Windows-SecureStartup-FilterDriver" processorArchitecture="arm64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <PreventDeviceEncryption>true</PreventDeviceEncryption>
    </component>
    <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="arm64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <UserAccounts>
        <LocalAccounts>
          <LocalAccount wcm:action="add">
            <Name>Docker</Name>
            <Group>Administrators</Group>
            <Password>
              <Value />
              <PlainText>true</PlainText>
            </Password>
          </LocalAccount>
        </LocalAccounts>
        <AdministratorPassword>
          <Value>password</Value>
          <PlainText>true</PlainText>
        </AdministratorPassword>
      </UserAccounts>
      <AutoLogon>
        <Username>Docker</Username>
        <Enabled>true</Enabled>
        <LogonCount>65432</LogonCount>
        <Password>
          <Value />
          <PlainText>true</PlainText>
        </Password>
      </AutoLogon>
      <Display>
        <ColorDepth>32</ColorDepth>
        <HorizontalResolution>1920</HorizontalResolution>
        <VerticalResolution>1080</VerticalResolution>
      </Display>
      <OOBE>
        <HideEULAPage>true</HideEULAPage>
        <HideLocalAccountScreen>true</HideLocalAccountScreen>
        <HideOEMRegistrationScreen>true</HideOEMRegistrationScreen>
        <HideOnlineAccountScreens>true</HideOnlineAccountScreens>
        <HideWirelessSetupInOOBE>true</HideWirelessSetupInOOBE>
        <NetworkLocation>Home</NetworkLocation>
        <ProtectYourPC>3</ProtectYourPC>
        <SkipUserOOBE>true</SkipUserOOBE>
        <SkipMachineOOBE>true</SkipMachineOOBE>
      </OOBE>
      <RegisteredOrganization>Dockur</RegisteredOrganization>
      <RegisteredOwner>Windows for Docker</RegisteredOwner>
    </component>
  </settings>
</unattend>
```

## Step 8: Inject Drivers into boot.wim

First, find the boot.wim file and determine which image index to use:

```bash
cd ~/windows-vm/iso-extracted/sources
wimlib-imagex info boot.wim
```

Look for the image index (typically index 2 for Windows Setup, or index 1 if only one image exists). Now prepare the drivers:

```bash
cd ~/windows-vm
mkdir -p drivers-temp
cd drivers-temp

# Extract drivers
tar -xf ../virtio-drivers.tar.xz

# Create WinPE driver directory structure
mkdir -p WinPEDrivers

# The driver structure in the archive is: driver-name/w11/ARM64/
# For example: qxl/w11/ARM64/, viostor/w11/ARM64/, etc.
# Copy each driver from its w11/ARM64 subfolder to WinPEDrivers

# List of drivers to inject (matching the container scripts)
DRIVERS="qxl viofs sriov smbus qxldod viorng viostor viomem NetKVM Balloon vioscsi pvpanic vioinput viogpudo vioserial qemupciserial"

# Find the extracted directory name (may vary)
EXTRACTED_DIR=$(find . -maxdepth 1 -type d -name "virtio*" | head -1)
if [ -z "$EXTRACTED_DIR" ]; then
  EXTRACTED_DIR="."
fi

# Copy each driver from w11/ARM64 folder
for driver in $DRIVERS; do
  DRIVER_PATH="$EXTRACTED_DIR/$driver/w11/ARM64"
  if [ -d "$DRIVER_PATH" ]; then
    mkdir -p "WinPEDrivers/$driver"
    cp -R "$DRIVER_PATH"/* "WinPEDrivers/$driver/"
    echo "Copied $driver"
  else
    echo "Warning: $driver not found at $DRIVER_PATH"
    # Try alternative path structure
    ALT_PATH=$(find "$EXTRACTED_DIR" -type d -path "*/$driver/*ARM64*" | head -1)
    if [ -n "$ALT_PATH" ]; then
      mkdir -p "WinPEDrivers/$driver"
      cp -R "$ALT_PATH"/* "WinPEDrivers/$driver/"
      echo "Copied $driver from alternative path"
    fi
  fi
done

# Verify drivers were copied
ls -la WinPEDrivers/
```

Now inject the drivers into boot.wim:

```bash
cd ~/windows-vm/iso-extracted/sources

# Determine the correct image index (usually 2 for Windows Setup)
IMAGE_INDEX=2
if ! wimlib-imagex info boot.wim | grep -q "Image Index: 2"; then
  IMAGE_INDEX=1
fi

# Remove existing WinPE drivers if any
wimlib-imagex update boot.wim $IMAGE_INDEX --command "delete --force --recursive /\$WinPEDriver\$" 2>/dev/null || true

# Add drivers to boot.wim
wimlib-imagex update boot.wim $IMAGE_INDEX --command "add ~/windows-vm/drivers-temp/WinPEDrivers /\$WinPEDriver\$"
```

## Step 9: Inject autounattend.xml into boot.wim

Inject the autounattend.xml file:

```bash
cd ~/windows-vm/iso-extracted/sources

# Determine the correct image index (should match the one used for drivers)
IMAGE_INDEX=2
if ! wimlib-imagex info boot.wim | grep -q "Image Index: 2"; then
  IMAGE_INDEX=1
fi

# Create temp directory for backup
mkdir -p ~/windows-vm/temp

# Try to extract existing autounattend.xml first (backup)
wimlib-imagex extract boot.wim $IMAGE_INDEX "/autounattend.xml" "--dest-dir=~/windows-vm/temp" 2>/dev/null || true

# Try to backup as autounattend.org if it exists
wimlib-imagex extract boot.wim $IMAGE_INDEX "/autounattend.org" "--dest-dir=~/windows-vm/temp" 2>/dev/null || true

# Add autounattend.xml to boot.wim
wimlib-imagex update boot.wim $IMAGE_INDEX --command "add ~/windows-vm/autounattend.xml /autounattend.xml"

# Also add as autounattend.dat (some Windows versions look for this)
wimlib-imagex update boot.wim $IMAGE_INDEX --command "add ~/windows-vm/autounattend.xml /autounattend.dat"
```

## Step 10: Rebuild ISO

Rebuild the ISO with the modified boot.wim. **On macOS, use `mkisofs` (from `cdrtools`) instead of `genisoimage`:**

```bash
cd ~/windows-vm

# Using mkisofs (from cdrtools package installed via Homebrew)
# mkisofs is functionally equivalent to genisoimage
mkisofs -o win11-arm64-modified.iso \
  -b boot/etfsboot.com \
  -no-emul-boot \
  -c BOOT.CAT \
  -iso-level 4 \
  -J -l -D -N \
  -joliet-long \
  -relaxed-filenames \
  -V "Windows" \
  -udf \
  -boot-info-table \
  -eltorito-alt-boot \
  -eltorito-boot efi/microsoft/boot/efisys_noprompt.bin \
  -no-emul-boot \
  -allow-limited-size \
  iso-extracted
```

**Note:** If `mkisofs` is not found, verify `cdrtools` is installed:
```bash
which mkisofs || echo "mkisofs not found - run: brew install cdrtools"
```

**Alternative:** If you prefer, you can create a symlink to use `genisoimage` as an alias:
```bash
# After installing cdrtools, create alias if you prefer genisoimage name
ln -s $(which mkisofs) /usr/local/bin/genisoimage 2>/dev/null || \
ln -s $(which mkisofs) ~/bin/genisoimage 2>/dev/null || \
echo "Using mkisofs directly (recommended)"
```

## Step 11: Run QEMU with Windows 11 ARM

Now run QEMU with HVF acceleration. This command matches the container implementation adapted for macOS:

```bash
cd ~/windows-vm

qemu-system-aarch64 \
  -accel hvf \
  -cpu host \
  -smp 2,sockets=1,dies=1,cores=2,threads=1 \
  -m 4G \
  -machine virt,highmem=off \
  -drive file=windows.img,format=qcow2,if=none,id=data3,cache=writeback,aio=threads,discard=on \
  -device virtio-scsi-pci,id=data3b,bus=pcie.0,addr=0xa,iothread=io2 \
  -device scsi-hd,drive=data3,bus=data3b.0,channel=0,scsi-id=0,lun=0,rotation_rate=1,bootindex=3 \
  -drive file=win11-arm64-modified.iso,format=raw,if=none,id=cdrom0,cache=unsafe,readonly=on,media=cdrom \
  -device virtio-scsi-pci,id=cdrom0b,bus=pcie.0,addr=0x5,iothread=io2 \
  -device scsi-cd,drive=cdrom0,bus=cdrom0b.0,bootindex=0 \
  -netdev user,id=hostnet0 \
  -device virtio-net-pci,netdev=hostnet0,bus=pcie.0 \
  -object rng-random,id=objrng0,filename=/dev/urandom \
  -device virtio-rng-pci,rng=objrng0,id=rng0,bus=pcie.0 \
  -device qemu-xhci,id=xhci \
  -device usb-tablet \
  -object iothread,id=io2 \
  -bios /opt/homebrew/share/qemu/edk2-aarch64-code.fd \
  -rtc base=localtime \
  -display vnc=:0 \
  -vnc 127.0.0.1:0 \
  -nodefaults \
  -name windows,process=windows,debug-threads=on \
  -monitor telnet:localhost:4444,server,nowait,nodelay \
  -serial mon:stdio
```

**Simplified version** (if the above doesn't work, try this simpler command):

```bash
cd ~/windows-vm

qemu-system-aarch64 \
  -accel hvf \
  -cpu host \
  -smp 2 \
  -m 4G \
  -machine virt \
  -drive file=windows.img,format=qcow2,if=virtio,cache=writeback \
  -drive file=win11-arm64-modified.iso,format=raw,if=none,id=cd0,media=cdrom \
  -device virtio-scsi-pci,id=scsi0 \
  -device scsi-cd,drive=cd0,bootindex=0 \
  -netdev user,id=net0 \
  -device virtio-net-pci,netdev=net0 \
  -device virtio-rng-pci \
  -device qemu-xhci,id=xhci \
  -device usb-tablet \
  -device usb-kbd \
  -bios /opt/homebrew/share/qemu/edk2-aarch64-code.fd \
  -rtc base=localtime \
  -display vnc=:0 \
  -vnc 127.0.0.1:0
```

**Note:** 
- If the OVMF firmware path is different, find it with: `find /opt/homebrew /usr/local -name "*aarch64*.fd" 2>/dev/null`
- You can also try without the `-bios` parameter to use QEMU's built-in UEFI
- For Apple Silicon Macs, `/dev/urandom` should work, but if not, you can use `/dev/random`

## Step 12: Connect via VNC

Connect to the VM using a VNC client:

```bash
# Using built-in macOS Screen Sharing (press Cmd+K in Finder, then enter):
vnc://127.0.0.1:5900

# Or use a VNC client like:
# - RealVNC Viewer
# - TigerVNC
# - TightVNC
```

The default VNC port is 5900 (display :0). If you want a different port, change `-vnc 127.0.0.1:0` to `-vnc 127.0.0.1:1` (for port 5901), etc.

## Step 13: Wait for Installation

The installation will proceed automatically. You can watch the progress in the VNC window. The installation typically takes 20-30 minutes.

Default credentials:
- Username: `Docker`
- Password: (empty, no password)

## Step 14: After Installation (Optional - RDP)

Once Windows is installed, you can connect via RDP for better performance:

1. In Windows, ensure Remote Desktop is enabled (it should be enabled by default via autounattend.xml)
2. Find the VM's IP address from QEMU's user network (usually 10.0.2.15)
3. Connect using Microsoft Remote Desktop or any RDP client:

```bash
# On macOS, you can use the built-in Microsoft Remote Desktop app
# Or install via: brew install --cask microsoft-remote-desktop
```

## Troubleshooting

### QEMU fails to start
- Ensure HVF is available: The `-accel hvf` option requires macOS 10.10+ and an Apple Silicon Mac
- Check QEMU version: `qemu-system-aarch64 --version`

### Drivers not loading
- Verify drivers were correctly extracted and copied
- Check the driver paths match the actual structure: `find virtio-win-0.1.285 -type d -name "ARM64"`

### ISO rebuild fails
- Ensure `cdrtools` is installed: `brew install cdrtools`
- Verify `mkisofs` is available: `which mkisofs`
- Check that all required boot files exist in `iso-extracted`
- If `mkisofs` fails, you may need to check the exact command syntax for your version

### VNC connection fails
- Try a different VNC port: Change `-vnc 127.0.0.1:0` to `-vnc 127.0.0.1:1`
- Check if port is in use: `lsof -i :5900`

### mkisofs command not found
- Install cdrtools: `brew install cdrtools`
- Verify installation: `which mkisofs`
- Add to PATH if needed: `export PATH="/opt/homebrew/bin:$PATH"` (for Apple Silicon) or `export PATH="/usr/local/bin:$PATH"` (for Intel)

## Notes

- The installation is fully automated - no user interaction required
- The default user "Docker" has no password and auto-logs in
- RDP is enabled by default for remote access
- Network is configured in user mode (NAT) - the VM can access the internet but uses 10.0.2.x addressing
- For better network performance, consider setting up bridge networking (more complex)
- **On macOS, use `mkisofs` instead of `genisoimage`** - they are functionally equivalent

## References

This guide is based on the excellent work from:
- [dockur/windows-arm](https://github.com/dockur/windows-arm) - Windows ARM container project
- [qemus/virtiso-arm](https://github.com/qemus/virtiso-arm) - VirtIO drivers for ARM

