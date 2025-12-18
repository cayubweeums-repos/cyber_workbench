/**
 * Preflight checks (lightweight regression protection)
 *
 * Goals:
 * - Verify we can import Python deps from the intended environment (./venv)
 * - Verify websockify binary resolution (same venv)
 * - Verify networking fallback logic behaves correctly when TAP is unavailable
 *
 * Usage:
 *   make preflight
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

const { getPythonExecutable, REPO_ROOT } = require('./python-bridge');
const { NetworkingSelector } = require('./networking');

async function run() {
  // --- Python / websockify checks ---
  const python = getPythonExecutable();
  console.log(`[preflight] python: ${python}`);

  const pyCheck = spawnSync(
    python,
    ['-c', [
      'import sys, pathlib, subprocess',
      'import yaml, websockify',
      'venv_bin = pathlib.Path(sys.executable).parent / "websockify"',
      'print("PY_OK")',
      'print("PY_EXE=" + sys.executable)',
      'print("WEBSOCKIFY_VENV_BIN=" + str(venv_bin))',
      'print("WEBSOCKIFY_VENV_BIN_EXISTS=" + str(venv_bin.exists()))',
      'rc = subprocess.run([str(venv_bin), "--help"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode if venv_bin.exists() else 1',
      'print("WEBSOCKIFY_HELP_RC=" + str(rc))',
    ].join('; ')],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );

  if (pyCheck.status !== 0) {
    console.error('[preflight] python stderr:\n' + (pyCheck.stderr || ''));
    throw new Error(`Python dependency check failed (exit ${pyCheck.status})`);
  }

  const out = (pyCheck.stdout || '').trim();
  console.log('[preflight] python output:\n' + out);
  assert(out.includes('PY_OK'), 'Expected PY_OK in python output');

  // --- Networking fallback checks (pure JS logic) ---
  const selector = new NetworkingSelector();

  // When TAP creation fails, we must fall back to user-mode and produce a warning
  {
    const warnings = [];
    const result = await selector.selectServiceNetworking({
      serviceName: 'windows',
      requestedNetworkName: 'internal',
      networkConfigs: { internal: { bridge_name: 'br-int', subnet: '192.168.50.0/24' } },
      createTap: async () => { throw new Error('SIOCIFCREATE2: Invalid argument'); },
      warnings,
    });
    assert.strictEqual(result.effectiveMode, 'user', 'Expected user-mode fallback when TAP fails');
    assert.strictEqual(result.networkConfig, null, 'Expected no networkConfig when falling back');
    assert(warnings.length >= 1, 'Expected warning when TAP fails');
  }

  console.log('[preflight] OK');
}

if (require.main === module) {
  Promise.resolve()
    .then(() => run())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(`[preflight] FAILED: ${e.message}`);
      process.exit(1);
    });
}


