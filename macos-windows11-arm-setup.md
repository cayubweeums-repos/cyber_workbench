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

Create the autounattend.xml file for unattended installation. **Important:** Save this file as `autounattend.xml` (exactly this name).

**About the filename:** Windows Setup searches for answer files in this order:
- `autounattend.xml` (primary - use this name)
- `autounattend.dat` (alternative - we'll inject this too in Step 10)
- `unattend.xml` (older Windows versions)

We'll save it as `autounattend.xml` and inject it into boot.wim as both `autounattend.xml` and `autounattend.dat` for maximum compatibility.

Save this as `autounattend.xml` in your `~/windows-vm/` directory:

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
cd iso-extracted/sources
wimlib-imagex info boot.wim
```

Look for the image index (typically index 2 for Windows Setup, or index 1 if only one image exists). Now prepare the drivers:

```bash
cd ../../
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
DRIVERS=(qxl viofs sriov smbus qxldod viorng viostor viomem NetKVM Balloon vioscsi pvpanic vioinput viogpudo vioserial qemupciserial)

# Find the extracted directory name (may vary)
EXTRACTED_DIR=$(find . -maxdepth 1 -type d -name "virtio*" | head -1)
if [ -z "$EXTRACTED_DIR" ]; then
  EXTRACTED_DIR="."
fi

# Copy each driver from w11/ARM64 folder
for driver in "${DRIVERS[@]}"; do
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

Now inject the drivers into boot.wim. **Important:** boot.wim typically has two images:
- Index 1: WinPE (Windows Preinstallation Environment)
- Index 2: Windows Setup (the installation environment)

We need to inject drivers into BOTH indices to ensure they're available during all phases:

```bash
cd ../iso-extracted/sources

# Check how many images are in boot.wim
wimlib-imagex info boot.wim

# Inject drivers into index 1 (WinPE) if it exists
if wimlib-imagex info boot.wim | grep -q "Image Index: 1"; then
  echo "Injecting drivers into boot.wim index 1 (WinPE)..."
  wimlib-imagex update boot.wim 1 --command "delete --force --recursive /\$WinPEDriver\$" 2>/dev/null || true
  wimlib-imagex update boot.wim 1 --command "add ../../drivers-temp/WinPEDrivers /\$WinPEDriver\$"
fi

# Inject drivers into index 2 (Windows Setup) if it exists
if wimlib-imagex info boot.wim | grep -q "Image Index: 2"; then
  echo "Injecting drivers into boot.wim index 2 (Windows Setup)..."
  sudo wimlib-imagex update boot.wim 2 --command "delete --force --recursive /\$WinPEDriver\$" 2>/dev/null || true
  sudo wimlib-imagex update boot.wim 2 --command "add ../../drivers-temp/WinPEDrivers /\$WinPEDriver\$"
else
  # If index 2 doesn't exist, use index 1
  echo "Only one image found, injecting into index 1..."
  sudo wimlib-imagex update boot.wim 1 --command "delete --force --recursive /\$WinPEDriver\$" 2>/dev/null || true
  sudo wimlib-imagex update boot.wim 1 --command "add ../../drivers-temp/WinPEDrivers /\$WinPEDriver\$"
fi
```

## Step 9: Copy Drivers to ISO Sources Directory

**Important:** In addition to injecting drivers into boot.wim, we also need to copy drivers to the `\$OEM\$/\$\$/Drivers` directory in the ISO sources folder. This is where Windows Setup automatically looks for drivers during the installation phase. This matches how the official dockur/windows container handles drivers for Windows 11.

```bash

# Create the $OEM$ directory structure
# Note: In zsh/bash, $$ is a special variable (process ID), so we need to escape it properly
# Using single quotes for the entire path ensures literal $ signs
sudo mkdir -p '$OEM$'/'$$'/Drivers

# Copy all drivers from WinPEDrivers to the ISO sources directory
# This allows Windows Setup to automatically find and install drivers during installation
sudo cp -R ../../drivers-temp/WinPEDrivers/* '$OEM$'/'$$'/Drivers/

# Verify drivers were copied (you should see all the driver directories)
ls -la '$OEM$'/'$$'/Drivers/
```

**Note:** The `\$OEM\$/\$\$/Drivers` directory is a special Windows installation directory. Windows Setup automatically searches this location for drivers during installation, which is why we need to place drivers here in addition to injecting them into boot.wim.

## Step 10: Inject autounattend.xml into boot.wim

**Critical:** autounattend.xml must be injected into the Windows Setup image (usually index 2) for it to be read during installation. This matches the exact method used in `windows/src/install.sh` lines 1072-1110.

**Important about filenames:** Windows Setup searches for answer files in this order:
1. `autounattend.xml` (primary - what we use)
2. `autounattend.dat` (alternative - some Windows versions look for this)
3. `unattend.xml` (older Windows versions)

The repos inject it as both `autounattend.xml` and `autounattend.dat` to ensure compatibility. We'll do the same.

```bash
cd iso-extracted/sources

# Verify autounattend.xml exists
if [ ! -f "../../autounattend.xml" ]; then
  echo "Error: autounattend.xml not found! Make sure it's in ~/windows-vm/"
  exit 1
fi

# Determine the correct index (matches windows/src/install.sh:1072-1077)
# Default to index 1, but use index 2 if it exists (Windows Setup)
index="1"
result=$(wimlib-imagex info -xml boot.wim 2>/dev/null | iconv -f UTF-16LE -t UTF-8 2>/dev/null || wimlib-imagex info boot.wim)

# Convert to uppercase for case-insensitive matching (zsh-compatible)
result_upper=$(echo "$result" | tr '[:lower:]' '[:upper:]')

if [[ "$result_upper" == *"<IMAGE INDEX=\"2\">"* ]] || echo "$result" | grep -q "Image Index: 2"; then
  index="2"
  echo "Using index 2 (Windows Setup)"
else
  echo "Using index 1 (only one image found)"
fi

# Backup existing autounattend.xml if it exists (matches windows/src/install.sh:1087-1095)
wimlib-imagex extract boot.wim $index "/autounattend.xml" "--dest-dir=/tmp" 2>/dev/null && \
  wimlib-imagex update boot.wim $index --command "rename /autounattend.xml /autounattend.org" 2>/dev/null || true

# Inject autounattend.xml (matches windows/src/install.sh:1106-1110)
echo "Injecting autounattend.xml into boot.wim index $index..."
if sudo wimlib-imagex update boot.wim $index --command "add ../../autounattend.xml /autounattend.xml"; then
  echo "✓ Successfully added autounattend.xml"
  # Also add as autounattend.dat (some Windows versions look for this)
  sudo wimlib-imagex update boot.wim $index --command "add ../../autounattend.xml /autounattend.dat" 2>/dev/null || true
  echo "✓ Also added as autounattend.dat"
else
  echo "✗ Failed to inject autounattend.xml!"
  exit 1
fi

# Verify injection worked
echo "Verifying autounattend.xml was injected into index $index..."
wimlib-imagex extract boot.wim $index "/autounattend.xml" "--dest-dir=/tmp" 2>/dev/null && \
  echo "✓ Verified: autounattend.xml found in index $index" || \
  echo "✗ WARNING: Could not verify autounattend.xml in index $index"
```

## Step 11: Rebuild ISO

Rebuild the ISO with the modified boot.wim. **On macOS, use `mkisofs` (from `cdrtools`) instead of `genisoimage`:**

```bash
cd ../../

# Using mkisofs (from cdrtools package installed via Homebrew)
# mkisofs is functionally equivalent to genisoimage
sudo mkisofs -o win11-arm64-modified.iso \
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
  iso-extracted
```

## Step 12: Run QEMU with Windows 11 ARM

```bash

qemu-system-aarch64 \
  -accel hvf \
  -cpu max \
  -smp 8 \
  -m 8G \
  -M virt \
  -drive file="$PWD/windows.img",format=qcow2,if=none,id=data3,cache=writeback,aio=threads,discard=on \
  -device virtio-scsi-pci,id=data3b,bus=pcie.0,addr=0xa,iothread=io2 \
  -device scsi-hd,drive=data3,bus=data3b.0,channel=0,scsi-id=0,lun=0,rotation_rate=1,bootindex=3 \
  -drive file="$PWD/win11-arm64-modified.iso",format=raw,if=none,id=cdrom0,cache=unsafe,readonly=on,media=cdrom \
  -device qemu-xhci,id=xhci,p2=7,p3=7 \
  -device usb-storage,drive=cdrom0,removable=on,bootindex=0 \
  -device usb-tablet \
  -netdev user,id=hostnet0 \
  -device virtio-net-pci,netdev=hostnet0,bus=pcie.0 \
  -object rng-random,id=objrng0,filename=/dev/urandom \
  -device virtio-rng-pci,rng=objrng0,id=rng0,bus=pcie.0 \
  -device ramfb \
  -object iothread,id=io2 \
  -bios /opt/homebrew/share/qemu/edk2-aarch64-code.fd \
  -rtc base=localtime \
  -display vnc=:0 \
  -vnc 127.0.0.1:0

```

**Key differences from previous version:**
- **ISO mounted as USB storage**: `-device usb-storage,drive=cdrom0,removable=on` (matches windows-arm repo)
- **Data disk uses virtio-scsi**: This requires the `vioscsi` driver (already in your driver list)
- **USB controller**: `qemu-xhci` is required for USB storage to work

**Alternative version using virtio-blk** (simpler, may be more reliable for driver detection):

This version uses `virtio-blk` instead of `virtio-scsi`, which uses the `viostor` driver instead of `vioscsi`. This may be more reliable for driver auto-detection:

```bash
cd ~/windows-vm

qemu-system-aarch64 \
  -accel hvf \
  -cpu max,pauth-impdef=on \
  -smp 8 \
  -m 8G \
  -M virt \
  -drive file=windows.img,format=qcow2,if=virtio,cache=writeback,bootindex=3 \
  -drive file=win11-arm64-modified.iso,format=raw,if=none,id=cdrom0,cache=unsafe,readonly=on,media=cdrom \
  -device virtio-scsi-pci,id=cdrom0b,bus=pcie.0,addr=0x5 \
  -device scsi-cd,drive=cdrom0,bus=cdrom0b.0,bootindex=0 \
  -netdev user,id=hostnet0 \
  -device virtio-net-pci,netdev=hostnet0,bus=pcie.0 \
  -object rng-random,id=objrng0,filename=/dev/urandom \
  -device virtio-rng-pci,rng=objrng0,id=rng0,bus=pcie.0 \
  -device ramfb \
  -device qemu-xhci,id=xhci \
  -device usb-tablet \
  -bios /opt/homebrew/share/qemu/edk2-aarch64-code.fd \
  -rtc base=localtime \
  -display vnc=:0 \
  -vnc 127.0.0.1:0
```

**Simplified version** (if the above doesn't work, try this simpler command):

```bash
cd ~/windows-vm

qemu-system-aarch64 \
  -accel hvf \
  -cpu max \
  -smp 4 \
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

## Step 13: Connect via VNC

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

## Step 14: Wait for Installation

The installation will proceed automatically. You can watch the progress in the VNC window. The installation typically takes 20-30 minutes.

Default credentials:
- Username: `Docker`
- Password: (empty, no password)

## Step 15: After Installation (Optional - RDP)

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

### Drivers not loading / Windows Setup prompts for drivers

If Windows Setup is asking you to browse for drivers, this means the drivers aren't being automatically detected. Check the following:

1. **Verify drivers were injected into both boot.wim indices:**
   ```bash
   cd ~/windows-vm/iso-extracted/sources
   wimlib-imagex info boot.wim
   # Check that drivers are in both index 1 and index 2
   ```

2. **Verify $OEM$ directory structure:**
   ```bash
   cd ~/windows-vm/iso-extracted/sources
   ls -la '$OEM$'/'$$'/Drivers/
   # You should see driver folders: qxl, viostor, NetKVM, vioscsi, etc.
   ```

3. **Check disk type matches drivers:**
   - **Data disk**: Uses `virtio-scsi` which requires the `vioscsi` driver
   - **ISO/CDROM**: Uses `usb-storage` (matches windows-arm repo) - Windows has built-in USB drivers
   - Verify `vioscsi` is in your driver list: `ls ~/windows-vm/drivers-temp/WinPEDrivers/ | grep -i scsi`
   - **Important**: The official windows-arm repo mounts the ISO as USB storage (not SCSI) for ARM64 Windows

4. **Try using virtio-blk instead of virtio-scsi** (simpler, may work better):
   In your QEMU command, change:
   ```bash
   # FROM (virtio-scsi):
   -drive file=windows.img,format=qcow2,if=none,id=data3,cache=writeback,aio=threads,discard=on \
   -device virtio-scsi-pci,id=data3b,bus=pcie.0,addr=0xa,iothread=io2 \
   -device scsi-hd,drive=data3,bus=data3b.0,channel=0,scsi-id=0,lun=0,rotation_rate=1,bootindex=3 \
   
   # TO (virtio-blk):
   -drive file=windows.img,format=qcow2,if=virtio,cache=writeback,bootindex=3
   ```
   This uses `viostor` driver instead of `vioscsi`, which may be more reliable.

5. **Verify driver structure in $OEM$:**
   Each driver should be in its own folder with the .inf, .sys, and .cat files:
   ```bash
   ls -la '$OEM$'/'$$'/Drivers/vioscsi/
   # Should show: vioscsi.inf, vioscsi.sys, vioscsi.cat, etc.
   ```

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

