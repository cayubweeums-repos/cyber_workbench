const { register, updateResourceMetrics } = require('../utils/metrics');
const { getResourceInfo } = require('../utils/limits');

/**
 * Prometheus metrics endpoint
 * Returns metrics in Prometheus text format
 */
async function getMetrics(req, res) {
  try {
    // Update resource metrics before scraping
    await updateResourceMetrics();
    
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    console.error('Error generating metrics:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Metrics summary endpoint (JSON format)
 * Returns metrics in JSON format for internal use
 */
async function getMetricsSummary(req, res) {
  try {
    await updateResourceMetrics();
    
    const resources = await getResourceInfo();
    const metricsData = await register.getMetricsAsJSON();
    
    res.json({
      resources,
      metrics: metricsData,
    });
  } catch (error) {
    console.error('Error generating metrics summary:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getMetrics,
  getMetricsSummary,
};

