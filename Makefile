.PHONY: start stop check-deps setup-venv setup-dirs setup-nodejs detect-os

# Get the absolute path of the repo root
REPO_ROOT := $(shell pwd)
VENV := $(REPO_ROOT)/venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip
WEB_UI_DIR := $(REPO_ROOT)/web-ui
NODE := node
NPM := npm

# Detect OS and Architecture
UNAME_S := $(shell uname -s)
UNAME_M := $(shell uname -m)

detect-os:
	@echo "Detected OS: $(UNAME_S)"
	@echo "Detected Architecture: $(UNAME_M)"

start: check-deps setup-venv setup-dirs setup-nodejs
	@echo "Starting VM Manager Web UI..."
	@cd $(WEB_UI_DIR) && $(NODE) server.js

stop:
	@echo "Stopping VM Manager..."
	@pkill -f "node.*server.js" || pkill -f "web-ui/server.js" || true
	@echo "VM Manager stopped"

check-deps: detect-os
	@echo "Checking dependencies..."
	@if [ "$(UNAME_S)" = "Darwin" ]; then \
		$(MAKE) check-deps-macos; \
	elif [ "$(UNAME_S)" = "Linux" ]; then \
		$(MAKE) check-deps-linux; \
	else \
		echo "Unsupported OS: $(UNAME_S)"; \
		exit 1; \
	fi

check-deps-macos:
	@echo "Checking macOS dependencies..."
	@if ! command -v brew >/dev/null 2>&1; then \
		echo "Homebrew not found. Installing Homebrew..."; \
		/bin/bash -c "$$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; \
	fi
	@echo "Checking for node..."
	@if ! command -v node >/dev/null 2>&1; then \
		echo "Node.js not found. Installing Node.js..."; \
		brew install node; \
	fi
	@echo "Checking for qemu..."
	@brew list qemu >/dev/null 2>&1 || brew install qemu
	@echo "Checking for wimlib..."
	@brew list wimlib >/dev/null 2>&1 || brew install wimlib
	@echo "Checking for cdrtools..."
	@brew list cdrtools >/dev/null 2>&1 || brew install cdrtools
	@echo "Checking for websockify..."
	@if ! command -v websockify >/dev/null 2>&1; then \
		echo "Installing websockify via pip..."; \
		pip3 install websockify || $(VENV)/bin/pip install websockify || echo "Warning: Could not install websockify. Install manually with: pip install websockify"; \
	fi
	@echo "All macOS dependencies installed"

check-deps-linux:
	@echo "Checking Linux dependencies..."
	@if command -v apt-get >/dev/null 2>&1; then \
		$(MAKE) check-deps-apt; \
	elif command -v dnf >/dev/null 2>&1; then \
		$(MAKE) check-deps-dnf; \
	elif command -v yum >/dev/null 2>&1; then \
		$(MAKE) check-deps-yum; \
	elif command -v pacman >/dev/null 2>&1; then \
		$(MAKE) check-deps-pacman; \
	else \
		echo "Unsupported Linux package manager. Please install qemu, wimlib, and cdrtools manually."; \
		exit 1; \
	fi

check-deps-apt:
	@echo "Using apt package manager (Debian/Ubuntu)..."
	@sudo apt-get update -qq
	@if [ "$(UNAME_M)" = "x86_64" ]; then \
		echo "x86_64 detected - installing qemu-system-aarch64 for ARM64 emulation..."; \
		dpkg -l | grep -q qemu-system-aarch64 || sudo apt-get install -y qemu-system-aarch64; \
	elif [ "$(UNAME_M)" = "aarch64" ] || [ "$(UNAME_M)" = "arm64" ]; then \
		echo "ARM64 detected - installing qemu-system-aarch64..."; \
		dpkg -l | grep -q qemu-system-aarch64 || sudo apt-get install -y qemu-system-aarch64; \
	else \
		echo "Unknown architecture $(UNAME_M) - attempting to install qemu-system-aarch64..."; \
		dpkg -l | grep -q qemu-system-aarch64 || sudo apt-get install -y qemu-system-aarch64; \
	fi
	@echo "Checking for wimlib..."
	@dpkg -l | grep -q wimlib || sudo apt-get install -y wimlib-tools
	@echo "Checking for genisoimage or mkisofs..."
	@if ! command -v genisoimage >/dev/null 2>&1 && ! command -v mkisofs >/dev/null 2>&1; then \
		sudo apt-get install -y genisoimage; \
	fi
	@echo "Checking for websockify..."
	@if ! command -v websockify >/dev/null 2>&1; then \
		echo "Installing websockify via pip..."; \
		pip3 install websockify || $(VENV)/bin/pip install websockify || echo "Warning: Could not install websockify. Install manually with: pip install websockify"; \
	fi
	@echo "All apt dependencies installed"

check-deps-dnf:
	@echo "Using dnf package manager (Fedora/RHEL)..."
	@if [ "$(UNAME_M)" = "x86_64" ]; then \
		echo "x86_64 detected - installing qemu-system-aarch64 for ARM64 emulation..."; \
		rpm -q qemu-system-aarch64 >/dev/null 2>&1 || sudo dnf install -y qemu-system-aarch64; \
	elif [ "$(UNAME_M)" = "aarch64" ] || [ "$(UNAME_M)" = "arm64" ]; then \
		echo "ARM64 detected - installing qemu-system-aarch64..."; \
		rpm -q qemu-system-aarch64 >/dev/null 2>&1 || sudo dnf install -y qemu-system-aarch64; \
	else \
		echo "Unknown architecture $(UNAME_M) - attempting to install qemu-system-aarch64..."; \
		rpm -q qemu-system-aarch64 >/dev/null 2>&1 || sudo dnf install -y qemu-system-aarch64; \
	fi
	@echo "Checking for wimlib..."
	@rpm -q wimlib >/dev/null 2>&1 || sudo dnf install -y wimlib
	@echo "Checking for genisoimage..."
	@rpm -q genisoimage >/dev/null 2>&1 || sudo dnf install -y genisoimage
	@echo "Checking for websockify..."
	@if ! command -v websockify >/dev/null 2>&1; then \
		echo "Installing websockify via pip..."; \
		pip3 install websockify || $(VENV)/bin/pip install websockify || echo "Warning: Could not install websockify. Install manually with: pip install websockify"; \
	fi
	@echo "All dnf dependencies installed"

check-deps-yum:
	@echo "Using yum package manager (RHEL/CentOS)..."
	@if [ "$(UNAME_M)" = "x86_64" ]; then \
		echo "x86_64 detected - installing qemu-system-aarch64 for ARM64 emulation..."; \
		rpm -q qemu-system-aarch64 >/dev/null 2>&1 || sudo yum install -y qemu-system-aarch64; \
	elif [ "$(UNAME_M)" = "aarch64" ] || [ "$(UNAME_M)" = "arm64" ]; then \
		echo "ARM64 detected - installing qemu-system-aarch64..."; \
		rpm -q qemu-system-aarch64 >/dev/null 2>&1 || sudo yum install -y qemu-system-aarch64; \
	else \
		echo "Unknown architecture $(UNAME_M) - attempting to install qemu-system-aarch64..."; \
		rpm -q qemu-system-aarch64 >/dev/null 2>&1 || sudo yum install -y qemu-system-aarch64; \
	fi
	@echo "Checking for wimlib..."
	@rpm -q wimlib >/dev/null 2>&1 || sudo yum install -y wimlib
	@echo "Checking for genisoimage..."
	@rpm -q genisoimage >/dev/null 2>&1 || sudo yum install -y genisoimage
	@echo "Checking for websockify..."
	@if ! command -v websockify >/dev/null 2>&1; then \
		echo "Installing websockify via pip..."; \
		pip3 install websockify || $(VENV)/bin/pip install websockify || echo "Warning: Could not install websockify. Install manually with: pip install websockify"; \
	fi
	@echo "All yum dependencies installed"

check-deps-pacman:
	@echo "Using pacman package manager (Arch Linux)..."
	@if [ "$(UNAME_M)" = "x86_64" ]; then \
		echo "x86_64 detected - installing qemu-system-aarch64 for ARM64 emulation..."; \
		pacman -Q qemu-system-aarch64 >/dev/null 2>&1 || sudo pacman -S --noconfirm qemu-system-aarch64; \
	elif [ "$(UNAME_M)" = "aarch64" ] || [ "$(UNAME_M)" = "arm64" ]; then \
		echo "ARM64 detected - installing qemu-system-aarch64..."; \
		pacman -Q qemu-system-aarch64 >/dev/null 2>&1 || sudo pacman -S --noconfirm qemu-system-aarch64; \
	else \
		echo "Unknown architecture $(UNAME_M) - attempting to install qemu-system-aarch64..."; \
		pacman -Q qemu-system-aarch64 >/dev/null 2>&1 || sudo pacman -S --noconfirm qemu-system-aarch64; \
	fi
	@echo "Checking for wimlib..."
	@pacman -Q wimlib >/dev/null 2>&1 || sudo pacman -S --noconfirm wimlib
	@echo "Checking for cdrtools..."
	@pacman -Q cdrtools >/dev/null 2>&1 || sudo pacman -S --noconfirm cdrtools
	@echo "Checking for websockify..."
	@if ! command -v websockify >/dev/null 2>&1; then \
		echo "Installing websockify via pip..."; \
		pip3 install websockify || $(VENV)/bin/pip install websockify || echo "Warning: Could not install websockify. Install manually with: pip install websockify"; \
	fi
	@echo "All pacman dependencies installed"

setup-venv:
	@echo "Setting up Python virtual environment..."
	@if [ ! -d "$(VENV)" ]; then \
		python3 -m venv $(VENV); \
	fi
	@$(PIP) install --upgrade pip --quiet
	@$(PIP) install -r $(REPO_ROOT)/requirements.txt --quiet
	@echo "Virtual environment ready"

setup-dirs:
	@echo "Setting up directory structure..."
	@mkdir -p $(REPO_ROOT)/vms/shared
	@if [ ! -f "$(REPO_ROOT)/vms/shared/autounattend.xml" ]; then \
		cp $(REPO_ROOT)/autounattend.xml $(REPO_ROOT)/vms/shared/autounattend.xml; \
		echo "Copied autounattend.xml to vms/shared/"; \
	fi
	@echo "Directory structure ready"

setup-nodejs:
	@echo "Setting up Node.js dependencies..."
	@cd $(WEB_UI_DIR) && $(NPM) install
	@echo "Node.js setup complete"

