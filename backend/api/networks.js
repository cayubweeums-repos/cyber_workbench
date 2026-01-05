const {
  listNetworks,
  createNetwork,
  inspectNetwork,
  deleteNetwork,
  summarizeNetworkInspect,
} = require('../utils/docker-networks');

function normalizeBoolean(v) {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return undefined;
}

function applyPreset(preset, input) {
  const base = { ...input };

  if (preset === 'shared-lan') {
    base.internal = base.internal ?? false;
    base.driver = base.driver || 'bridge';
    base.options = {
      'com.docker.network.bridge.enable_icc': 'true',
      ...(base.options || {}),
    };
    base.labels = { 'vapiorc.purpose': 'shared-lan', ...(base.labels || {}) };
  } else if (preset === 'isolated-group') {
    base.internal = base.internal ?? true;
    base.driver = base.driver || 'bridge';
    base.options = {
      'com.docker.network.bridge.enable_icc': 'true',
      ...(base.options || {}),
    };
    base.labels = { 'vapiorc.purpose': 'isolated-group', ...(base.labels || {}) };
  } else {
    base.labels = { 'vapiorc.purpose': 'custom', ...(base.labels || {}) };
  }

  return base;
}

async function getNetworks(req, res) {
  try {
    const all = normalizeBoolean(req.query.all) === true;
    const networks = await listNetworks({ all });
    res.json({ success: true, networks });
  } catch (e) {
    console.error('Error listing networks:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
}

async function postNetwork(req, res) {
  try {
    const {
      name,
      preset,
      driver,
      internal,
      attachable,
      enableIPv6,
      ipam,
      labels,
      options,
    } = req.body || {};

    const merged = applyPreset(preset, {
      name,
      driver: driver || 'bridge',
      internal: typeof internal === 'boolean' ? internal : undefined,
      attachable: typeof attachable === 'boolean' ? attachable : undefined,
      enableIPv6: typeof enableIPv6 === 'boolean' ? enableIPv6 : false,
      ipam,
      labels,
      options,
    });

    // If caller explicitly sets internal, respect it even with preset.
    if (typeof internal === 'boolean') merged.internal = internal;

    // Ensure we always have a purpose label.
    merged.labels = merged.labels || {};
    if (!merged.labels['vapiorc.purpose']) {
      merged.labels['vapiorc.purpose'] = preset || 'custom';
    }

    const created = await createNetwork(merged);
    res.status(201).json({ success: true, network: created });
  } catch (e) {
    const status = e.statusCode || 500;
    console.error('Error creating network:', e.message);
    res.status(status).json({ success: false, error: e.message, ...(e.details && { details: e.details }) });
  }
}

async function getNetworkInspect(req, res) {
  try {
    const { idOrName } = req.params;
    const { info } = await inspectNetwork(idOrName);
    const raw = normalizeBoolean(req.query.raw) === true;
    res.json({
      success: true,
      network: summarizeNetworkInspect(info),
      ...(raw && { raw: info }),
    });
  } catch (e) {
    const status = e.statusCode || 500;
    console.error('Error inspecting network:', e.message);
    res.status(status).json({ success: false, error: e.message });
  }
}

async function deleteNetworkHandler(req, res) {
  try {
    const { idOrName } = req.params;
    const result = await deleteNetwork(idOrName);
    res.json({ success: true, ...result });
  } catch (e) {
    const status = e.statusCode || 500;
    console.error('Error deleting network:', e.message);
    res.status(status).json({ success: false, error: e.message, ...(e.details && { details: e.details }) });
  }
}

module.exports = {
  getNetworks,
  postNetwork,
  getNetworkInspect,
  deleteNetworkHandler,
};


