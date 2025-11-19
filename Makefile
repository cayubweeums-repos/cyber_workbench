.PHONY: start stop check-deps setup-venv setup-dirs

# Get the absolute path of the repo root
REPO_ROOT := $(shell pwd)
VENV := $(REPO_ROOT)/venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip

start: check-deps setup-venv setup-dirs
	@echo "Starting VM Manager..."
	@$(PYTHON) -u $(REPO_ROOT)/app.py

stop:
	@echo "Stopping VM Manager..."
	@pkill -f "app.py" || true
	@echo "VM Manager stopped"

check-deps:
	@echo "Checking dependencies..."
	@if ! command -v brew >/dev/null 2>&1; then \
		echo "Homebrew not found. Installing Homebrew..."; \
		/bin/bash -c "$$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; \
	fi
	@echo "Checking for qemu..."
	@brew list qemu >/dev/null 2>&1 || brew install qemu
	@echo "Checking for wimlib..."
	@brew list wimlib >/dev/null 2>&1 || brew install wimlib
	@echo "Checking for cdrtools..."
	@brew list cdrtools >/dev/null 2>&1 || brew install cdrtools
	@echo "All dependencies installed"

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

