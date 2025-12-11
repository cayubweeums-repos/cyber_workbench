.PHONY: start check-brew install-brew check-node install-node install-deps

start: check-brew check-node install-deps
	@echo "--- Starting noVNC web server ---"
	@npm start

check-brew:
	@echo "--- Checking Homebrew installation ---"
	@if ! command -v brew >/dev/null 2>&1; then \
		echo "--- Homebrew is not installed. Installing... ---"; \
		$(MAKE) install-brew; \
	else \
		echo "--- Homebrew is already installed ---"; \
	fi

install-brew:
	@echo "--- Installing Homebrew ---"
	@NONINTERACTIVE=1 /bin/bash -c "$$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
	@echo "--- Homebrew installation complete ---"

check-node:
	@echo "--- Checking Node.js/npm installation ---"
	@if ! command -v node >/dev/null 2>&1; then \
		echo "--- Node.js/npm is not installed. Installing via Homebrew... ---"; \
		$(MAKE) install-node; \
	else \
		echo "--- Node.js/npm is already installed ---"; \
	fi

install-node:
	@echo "--- Installing Node.js via Homebrew ---"
	@brew install node
	@echo "--- Node.js installation complete ---"

install-deps:
	@echo "--- Installing project dependencies ---"
	@npm install
	@echo "--- Dependencies installed ---"
