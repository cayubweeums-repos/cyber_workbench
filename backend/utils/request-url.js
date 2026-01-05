/**
 * Compute outward-facing URLs from an incoming Express request.
 *
 * We avoid hard-coding hostnames/base URLs so VapiorC can run behind reverse proxies.
 */

function getForwardedHeader(req, name) {
  const v = req.get(name);
  if (!v) return null;
  // Some proxies provide comma-separated values; first value is the original.
  return v.split(',')[0].trim();
}

function getRequestProtocol(req) {
  return getForwardedHeader(req, 'x-forwarded-proto') || req.protocol;
}

function getRequestHost(req) {
  // Prefer forwarded host when behind a reverse proxy.
  return getForwardedHeader(req, 'x-forwarded-host') || req.get('host');
}

function stripPortFromHost(host) {
  if (!host) return host;

  // IPv6 in brackets: [::1]:8080 or [::1]
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    if (end === -1) return host;
    return host.slice(0, end + 1);
  }

  // IPv4/hostname: example.com:8080
  const idx = host.lastIndexOf(':');
  if (idx === -1) return host;
  const maybePort = host.slice(idx + 1);
  if (/^\d+$/.test(maybePort)) {
    return host.slice(0, idx);
  }
  return host;
}

function hostWithPort(host, port) {
  const base = stripPortFromHost(host);
  return `${base}:${port}`;
}

function getRequestOrigin(req) {
  const proto = getRequestProtocol(req);
  const host = getRequestHost(req);
  return `${proto}://${host}`;
}

function getRequestOriginWithPort(req, port) {
  const proto = getRequestProtocol(req);
  const host = getRequestHost(req);
  return `${proto}://${hostWithPort(host, port)}`;
}

module.exports = {
  getRequestProtocol,
  getRequestHost,
  stripPortFromHost,
  hostWithPort,
  getRequestOrigin,
  getRequestOriginWithPort,
};


