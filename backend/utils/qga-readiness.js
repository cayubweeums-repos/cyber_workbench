const { execInContainer } = require('./container-exec');

/**
 * QGA readiness signals are fetched from the Flask API running inside the Windows VM container.
 *
 * CRITICAL: Never talk to the QGA unix socket directly (e.g. `nc -U /tmp/qga/qga.sock`) because it can hang.
 * Always use the HTTP API and hard timeouts.
 */

async function getQgaHealth(container, opts = {}) {
  const curlMaxTimeSec = String(opts.curlMaxTimeSec ?? 5);
  const execTimeoutMs = Number(opts.execTimeoutMs ?? 8000);

  const { stdout, stderr } = await execInContainer(
    container,
    ['curl', '-s', '--max-time', curlMaxTimeSec, 'http://localhost:8007/api/health'],
    execTimeoutMs
  );

  if (!stdout) {
    return { qgaReady: false, qgaError: 'Empty response from QGA health endpoint', stderr };
  }

  try {
    const health = JSON.parse(stdout);
    const qgaReady = health.status === 'healthy' && health.qga === 'connected';
    return {
      qgaReady,
      qgaError: qgaReady ? null : (health.error || 'QGA health check returned unhealthy status'),
      stderr,
      raw: health,
    };
  } catch (e) {
    return { qgaReady: false, qgaError: `Failed to parse QGA health JSON: ${e.message}`, stderr, rawText: stdout };
  }
}

async function getDesktopReady(container, opts = {}) {
  const curlMaxTimeSec = String(opts.curlMaxTimeSec ?? 10);
  const execTimeoutMs = Number(opts.execTimeoutMs ?? 15000);

  const { stdout, stderr } = await execInContainer(
    container,
    ['curl', '-s', '--max-time', curlMaxTimeSec, 'http://localhost:8007/api/desktop-ready'],
    execTimeoutMs
  );

  if (!stdout) {
    return { desktopReady: false, desktopError: 'Empty response from desktop-ready endpoint', stderr };
  }

  try {
    const desktop = JSON.parse(stdout);
    const desktopReady = desktop.ready === true;
    return {
      desktopReady,
      desktopError: desktopReady ? null : (desktop.error || desktop.details || 'Desktop not ready'),
      stderr,
      raw: desktop,
    };
  } catch (e) {
    return { desktopReady: false, desktopError: `Failed to parse desktop-ready JSON: ${e.message}`, stderr, rawText: stdout };
  }
}

module.exports = {
  getQgaHealth,
  getDesktopReady,
};


