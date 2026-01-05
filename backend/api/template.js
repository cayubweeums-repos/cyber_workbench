const { markAsTemplate, unmarkAsTemplate, getTemplateInfo } = require('../utils/template');

/**
 * Mark VM as template
 */
async function markVmAsTemplate(req, res) {
  const { containerName } = req.params;
  
  try {
    const result = await markAsTemplate(containerName);
    res.json(result);
  } catch (error) {
    console.error('Error marking VM as template:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Unmark VM as template
 */
async function unmarkVmAsTemplate(req, res) {
  const { containerName } = req.params;
  
  try {
    const result = await unmarkAsTemplate(containerName);
    res.json(result);
  } catch (error) {
    console.error('Error unmarking template:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Get template info
 */
async function getTemplateInfoHandler(req, res) {
  const { containerName } = req.params;
  
  try {
    const info = getTemplateInfo(containerName);
    
    if (!info) {
      return res.status(404).json({ success: false, error: 'Not a template' });
    }
    
    res.json({ success: true, template: info });
  } catch (error) {
    console.error('Error getting template info:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  markVmAsTemplate,
  unmarkVmAsTemplate,
  getTemplateInfoHandler
};

