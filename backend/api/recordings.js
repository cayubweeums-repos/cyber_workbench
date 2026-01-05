const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { docker } = require('../utils/docker');

const execAsync = promisify(exec);
const RECORDINGS_BASE = process.env.RECORDINGS_PATH || '/app/storage/recordings';
const HOST_RECORDINGS_PATH = process.env.HOST_RECORDINGS_PATH || RECORDINGS_BASE; // Host path for docker-in-docker mounts

/**
 * List all recordings and videos for a specific container
 * Shows:
 * - Ongoing sessions (container running, recording in progress)
 * - Converted videos (.mp4 files ready to play)
 * - Raw recordings (need conversion)
 * Filters by container name prefix
 */
async function listRecordings(req, res) {
  const { containerName } = req.params;
  
  try {
    const recordingsPath = RECORDINGS_BASE;
    
    if (!fs.existsSync(recordingsPath)) {
      fs.mkdirSync(recordingsPath, { recursive: true });
    }
    
    const files = fs.readdirSync(recordingsPath);
    
    // Filter files by container name prefix
    const containerPrefix = `${containerName}_session-`;
    const containerFiles = files.filter(f => f.startsWith(containerPrefix));
    
    // Separate files by type
    const rawRecordings = containerFiles.filter(f => !f.endsWith('.mp4') && !f.endsWith('.m4v'));
    const videos = containerFiles.filter(f => f.endsWith('.mp4')); // Converted MP4 videos
    
    // Check if container is running (ongoing session)
    let isOngoing = false;
    try {
      const container = docker.getContainer(containerName);
      const info = await container.inspect();
      isOngoing = info.State.Running;
    } catch (err) {
      // Container doesn't exist or not running
      isOngoing = false;
    }
    
    const recordings = [];
    
    // Add ongoing session indicator
    if (isOngoing && rawRecordings.length > 0) {
      // Find the most recent recording (likely the one being written)
      const latestRecording = rawRecordings.sort().reverse()[0];
      recordings.push({
        filename: latestRecording,
        type: 'ongoing',
        size: 0,
        date: new Date().toISOString(),
        modified: Date.now()
      });
    }
    
    // Add all raw recordings (need conversion to MP4)
    rawRecordings.forEach(file => {
      const isCurrentlyOngoing = isOngoing && file === rawRecordings.sort().reverse()[0];
      
      const filePath = path.join(recordingsPath, file);
      const stats = fs.statSync(filePath);
      
      recordings.push({
        filename: file,
        type: isCurrentlyOngoing ? 'ongoing' : 'raw', // Raw recordings need conversion
        size: stats.size,
        date: stats.mtime.toISOString(),
        modified: stats.mtime.getTime()
      });
    });
    
    // Add converted MP4 videos (ready to play)
    videos.forEach(file => {
      const filePath = path.join(recordingsPath, file);
      const stats = fs.statSync(filePath);
      
      recordings.push({
        filename: file,
        type: 'video', // MP4 videos ready to play
        size: stats.size,
        date: stats.mtime.toISOString(),
        modified: stats.mtime.getTime()
      });
    });
    
    recordings.sort((a, b) => b.modified - a.modified);
    
    res.json({ success: true, recordings });
  } catch (error) {
    console.error('Error listing recordings:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Convert a recording to video using guacenc (built into vm-manager)
 * Converts Guacamole .guac recordings to MP4 using H.264 codec for universal browser compatibility
 * guacenc is available at /usr/local/bin/guacenc via guacamole-server build
 */
async function convertRecording(req, res) {
  const { containerName, filename } = req.params;
  
  try {
    // Security check
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }
    
    // Verify filename matches container name
    const containerPrefix = `${containerName}_session-`;
    if (!filename.startsWith(containerPrefix)) {
      return res.status(403).json({ success: false, error: 'Recording does not belong to this container' });
    }
    
    const recordingPath = path.join(RECORDINGS_BASE, filename);
    
    if (!fs.existsSync(recordingPath)) {
      return res.status(404).json({ success: false, error: 'Recording not found' });
    }
    
    // Raw recordings have no extension (e.g., "win11_test_session-20251026-231215")
    // MP4 files will have .mp4 extension added
    // Ensure filename doesn't already have .mp4 extension (shouldn't happen, but check)
    const baseFilename = filename.endsWith('.mp4') ? filename.replace(/\.mp4$/, '') : filename;
    const mp4Filename = `${baseFilename}.mp4`;
    
    console.log(`Converting recording: ${filename} (raw, no extension) → ${mp4Filename} using guacenc → ffmpeg (H.264)`);
    
    // Step 1: Execute guacenc to create m4v at 1920x1080 with high bitrate for quality
    // -s: resolution, -r: bitrate (higher = better quality), -f: force overwrite
    const guacencCommand = `guacenc -s 1920x1080 -r 8000000 -f ${recordingPath}`;
    const { stdout: guacencOut, stderr: guacencErr } = await execAsync(guacencCommand);
    
    if (guacencErr) {
      console.log(`guacenc stderr: ${guacencErr}`);
    }
    if (guacencOut) {
      console.log(`guacenc stdout: ${guacencOut}`);
    }
    
    // guacenc creates .m4v file by default (adds .m4v extension to input filename)
    const m4vPath = path.join(RECORDINGS_BASE, `${baseFilename}.m4v`);
    
    if (!fs.existsSync(m4vPath)) {
      console.error(`guacenc failed, .m4v not found: ${m4vPath}`);
      throw new Error('Video file not created by guacenc');
    }
    
    console.log(`Successfully created m4v: ${baseFilename}.m4v`);
    
    // Step 2: Convert m4v to mp4 with H.264 encoding
    // H.264 is universally supported by all browsers (unlike H.265/HEVC which has limited support)
    // H.264 provides excellent quality and file size with maximum compatibility
    const mp4Path = path.join(RECORDINGS_BASE, mp4Filename);
    
    // Build ffmpeg command with H.264 codec
    // -vf: video filters (scale + sharpening for quality)
    // -c:v libx264: H.264 encoder (universal browser support)
    // -preset slow: better compression ratio (slower encoding but smaller files)
    // -crf 15: high quality setting (lower = better quality, 15 is very high quality for H.264)
    // -pix_fmt yuv420p: maximum browser compatibility
    // -tune film: optimized for video content
    const ffmpegCommand = `ffmpeg -i ${m4vPath} -vf "scale=1920:1080:flags=lanczos,unsharp=5:5:0.8:5:5:0.0" -c:v libx264 -preset slow -crf 15 -pix_fmt yuv420p -tune film -c:a copy ${mp4Path}`;
    
    console.log(`Converting m4v to mp4 with H.264 codec at 1920x1080...`);
    
    const { stdout: ffmpegOut, stderr: ffmpegErr } = await execAsync(ffmpegCommand);
    
    if (ffmpegErr && !ffmpegErr.includes('frame=')) {
      // ffmpeg writes progress to stderr, so only log non-progress messages
      console.log(`ffmpeg stderr: ${ffmpegErr}`);
    }
    if (ffmpegOut) {
      console.log(`ffmpeg stdout: ${ffmpegOut}`);
    }
    
    if (!fs.existsSync(mp4Path)) {
      throw new Error('MP4 file not created by ffmpeg');
    }
    
    console.log(`Successfully converted to MP4 (H.264): ${mp4Filename}`);
    
    // Verify MP4 file exists before cleanup
    if (!fs.existsSync(mp4Path)) {
      throw new Error('MP4 file not found after conversion - cannot proceed with cleanup');
    }
    
    // Step 3: Cleanup - delete intermediate m4v and original raw recording
    // Only proceed with cleanup after successful MP4 conversion
    let cleanupErrors = [];
    
    // Delete intermediate m4v file
    try {
      if (fs.existsSync(m4vPath)) {
        fs.unlinkSync(m4vPath);
        console.log(`✓ Deleted intermediate m4v: ${m4vPath}`);
      }
    } catch (err) {
      cleanupErrors.push(`Failed to delete m4v: ${err.message}`);
      console.error(`⚠ Failed to delete m4v: ${err.message}`);
    }
    
    // Delete original raw recording file (keep only MP4)
    try {
      if (fs.existsSync(recordingPath)) {
        fs.unlinkSync(recordingPath);
        console.log(`✓ Deleted original raw recording: ${recordingPath}`);
        console.log(`✓ Only MP4 file retained: ${mp4Filename}`);
      } else {
        console.log(`ℹ Raw recording already deleted: ${recordingPath}`);
      }
    } catch (err) {
      cleanupErrors.push(`Failed to delete raw recording: ${err.message}`);
      console.error(`⚠ Failed to delete raw recording: ${err.message}`);
    }
    
    // Conversion is successful even if cleanup fails (MP4 was created)
    if (cleanupErrors.length > 0) {
      console.warn(`Conversion successful but cleanup had errors: ${cleanupErrors.join('; ')}`);
    }
    
    res.json({ success: true, video: mp4Filename });
  } catch (error) {
    console.error('Error converting recording:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Download a recording or video file
 */
async function downloadRecording(req, res) {
  const { containerName, filename } = req.params;
  
  try {
    // Security check
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }
    
    // Verify filename matches container name
    const containerPrefix = `${containerName}_session-`;
    if (!filename.startsWith(containerPrefix)) {
      return res.status(403).json({ success: false, error: 'Recording does not belong to this container' });
    }
    
    const filePath = path.join(RECORDINGS_BASE, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    
    // Set appropriate content type based on file extension
    if (filename.endsWith('.mp4')) {
      // MP4 video file
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    } else {
      // Raw Guacamole recording (text format)
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }
    
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error downloading recording:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Delete a recording and its video (if exists)
 */
async function deleteRecording(req, res) {
  const { containerName, filename } = req.params;
  
  try {
    // Security check
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }
    
    // Verify filename matches container name
    const containerPrefix = `${containerName}_session-`;
    if (!filename.startsWith(containerPrefix)) {
      return res.status(403).json({ success: false, error: 'Recording does not belong to this container' });
    }
    
    const filePath = path.join(RECORDINGS_BASE, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    
    // Delete the file
    fs.unlinkSync(filePath);
    console.log(`Deleted: ${filePath}`);
    
    // Also delete associated raw recording if this is a video
    // (Though conversion already deletes it, this is a safety check)
    if (filename.endsWith('.mp4')) {
      const rawRecording = filename.replace('.mp4', '');
      const rawPath = path.join(RECORDINGS_BASE, rawRecording);
      if (fs.existsSync(rawPath)) {
        fs.unlinkSync(rawPath);
        console.log(`Deleted associated raw recording: ${rawPath}`);
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting recording:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * List all recordings across all containers (for recordings tab)
 */
async function listAllRecordings(req, res) {
  try {
    const recordingsPath = RECORDINGS_BASE;
    
    if (!fs.existsSync(recordingsPath)) {
      fs.mkdirSync(recordingsPath, { recursive: true });
    }
    
    const files = fs.readdirSync(recordingsPath);
    
    // Group recordings by container
    const recordingsByContainer = {};
    
    files.forEach(file => {
      // Include both raw recordings and MP4 videos
      
      // Parse container name from filename: {containerName}_session-{date}-{time}
      const match = file.match(/^(.+?)_session-/);
      if (match) {
        const containerName = match[1];
        
        if (!recordingsByContainer[containerName]) {
          recordingsByContainer[containerName] = {
            containerName,
            recordings: []
          };
        }
        
        const filePath = path.join(recordingsPath, file);
        const stats = fs.statSync(filePath);
        
        // Determine type: raw recording (needs conversion) or video (MP4 ready to play)
        let type = file.endsWith('.mp4') ? 'video' : 'raw';
        
        recordingsByContainer[containerName].recordings.push({
          filename: file,
          type, // 'raw' needs conversion, 'video' is ready to play
          size: stats.size,
          date: stats.mtime.toISOString(),
          modified: stats.mtime.getTime()
        });
      }
    });
    
    // Convert to array and sort recordings within each container
    const result = Object.values(recordingsByContainer).map(container => {
      container.recordings.sort((a, b) => b.modified - a.modified);
      return container;
    });
    
    // Sort containers by name
    result.sort((a, b) => a.containerName.localeCompare(b.containerName));
    
    res.json({ success: true, containers: result });
  } catch (error) {
    console.error('Error listing all recordings:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  listRecordings,
  listAllRecordings,
  convertRecording,
  downloadRecording,
  deleteRecording
};
