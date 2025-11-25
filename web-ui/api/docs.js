/**
 * Documentation API Routes
 * Serves markdown files from the docs/ directory
 */

const fs = require('fs').promises;
const path = require('path');
const { marked } = require('marked');
const hljs = require('highlight.js');

// Configure marked with GitHub-flavored markdown
marked.setOptions({
  gfm: true,
  breaks: true,
  highlight: function(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (err) {
        console.error('Highlight error:', err);
      }
    }
    return hljs.highlightAuto(code).value;
  }
});

const REPO_ROOT = path.join(__dirname, '../..');
const DOCS_DIR = path.join(REPO_ROOT, 'docs');

/**
 * Get the list of markdown files in a directory
 */
async function getDirectoryListing(dirPath, relativePath = '') {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = [];
    const directories = [];

    for (const entry of entries) {
      // Skip hidden files and directories
      if (entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      const relativeFilePath = path.join(relativePath, entry.name).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        directories.push({
          name: entry.name,
          path: relativeFilePath,
          type: 'directory'
        });
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const stats = await fs.stat(fullPath);
        files.push({
          name: entry.name,
          path: relativeFilePath,
          type: 'file',
          size: stats.size,
          modified: stats.mtime
        });
      }
    }

    // Sort: directories first, then files, both alphabetically
    directories.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    return [...directories, ...files];
  } catch (error) {
    throw new Error(`Failed to read directory: ${error.message}`);
  }
}

/**
 * Get markdown file content
 */
async function getMarkdownContent(filePath) {
  try {
    const fullPath = path.join(DOCS_DIR, filePath);
    
    // Security: Ensure the path is within the docs directory
    const resolvedPath = path.resolve(fullPath);
    const resolvedDocsDir = path.resolve(DOCS_DIR);
    
    if (!resolvedPath.startsWith(resolvedDocsDir)) {
      throw new Error('Invalid path: outside docs directory');
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    const html = marked.parse(content);
    
    return {
      content: html,
      raw: content
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('File not found');
    }
    throw new Error(`Failed to read file: ${error.message}`);
  }
}

/**
 * Get directory listing API endpoint
 */
async function listDocs(req, res) {
  try {
    const { path: dirPath = '' } = req.query;
    const fullDirPath = dirPath ? path.join(DOCS_DIR, dirPath) : DOCS_DIR;
    
    // Security: Ensure the path is within the docs directory
    const resolvedPath = path.resolve(fullDirPath);
    const resolvedDocsDir = path.resolve(DOCS_DIR);
    
    if (!resolvedPath.startsWith(resolvedDocsDir)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid path: outside docs directory' 
      });
    }

    const stats = await fs.stat(fullDirPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Path is not a directory' 
      });
    }

    const listing = await getDirectoryListing(fullDirPath, dirPath);
    res.json({ success: true, listing });
  } catch (error) {
    console.error('Directory listing error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}

/**
 * Get markdown content API endpoint
 */
async function getDocContent(req, res) {
  try {
    const filePath = req.params.path || '';
    
    if (!filePath) {
      // Try to serve README.md from root
      const readmePath = path.join(DOCS_DIR, 'README.md');
      try {
        await fs.access(readmePath);
        const content = await getMarkdownContent('README.md');
        return res.json({ success: true, ...content });
      } catch (error) {
        // If no README, return directory listing
        const listing = await getDirectoryListing(DOCS_DIR);
        return res.json({ success: true, listing, isDirectory: true });
      }
    }

    const fullPath = path.join(DOCS_DIR, filePath);
    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      // Return directory listing
      const listing = await getDirectoryListing(fullPath, filePath);
      return res.json({ success: true, listing, isDirectory: true });
    }

    // Return markdown content
    const content = await getMarkdownContent(filePath);
    res.json({ success: true, ...content, isDirectory: false });
  } catch (error) {
    console.error('Get doc content error:', error);
    if (error.message === 'File not found') {
      return res.status(404).json({ 
        success: false, 
        error: 'Documentation file not found' 
      });
    }
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}

module.exports = {
  listDocs,
  getDocContent
};

