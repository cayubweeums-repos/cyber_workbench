const { exec } = require('child_process');
const { getImage } = require('./docker');

/**
 * Build Windows Docker image
 */
async function buildWindowsImage(imageBuildState) {
  const imageName = 'dockurr/windows:custom';
  
  imageBuildState.isBuilding = true;
  imageBuildState.progress = 0;
  imageBuildState.currentStep = 'Checking if image exists...';
  imageBuildState.error = null;
  imageBuildState.logs = [];
  
  try {
    // Check if image already exists
    try {
      await getImage(imageName).inspect();
      console.log('Windows image already exists, skipping build');
      imageBuildState.isReady = true;
      imageBuildState.isBuilding = false;
      imageBuildState.progress = 100;
      imageBuildState.currentStep = 'Image ready';
      return;
    } catch (e) {
      console.log('Windows image not found, starting build...');
    }
    
    imageBuildState.currentStep = 'Building Windows VM image...';
    imageBuildState.progress = 5;
    
    const buildCommand = `docker build -t ${imageName} \
      --build-arg VERSION_ARG="VapiorC" \
      --build-arg TARGETARCH=amd64 \
      --progress=plain \
      -f /app/vm-builder/Dockerfile \
      /app/vm-builder 2>&1`;
    
    console.log('Executing build command...');
    
    const buildProcess = exec(buildCommand, {
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer
    });
    
    let totalSteps = 0;
    let completedSteps = new Set();
    
    buildProcess.stdout.on('data', (data) => {
      const output = data.toString();
      imageBuildState.logs.push(output);
      
      if (imageBuildState.logs.length > 100) {
        imageBuildState.logs.shift();
      }
      
      const stepMatch = output.match(/#(\d+)\s+\[([^\]]+)\]/);
      if (stepMatch) {
        const stepNum = parseInt(stepMatch[1]);
        const stepName = stepMatch[2];
        
        if (stepNum > totalSteps) {
          totalSteps = stepNum;
        }
        
        imageBuildState.currentStep = `Step ${stepNum}/${totalSteps}: ${stepName}`;
      }
      
      if ((output.includes('DONE') || output.includes('CACHED')) && stepMatch) {
        const stepNum = parseInt(stepMatch[1]);
        completedSteps.add(stepNum);
        
        if (totalSteps > 0) {
          const percentComplete = (completedSteps.size / totalSteps) * 85;
          imageBuildState.progress = Math.floor(5 + percentComplete);
        }
      }
      
      console.log(output);
    });
    
    buildProcess.stderr.on('data', (data) => {
      const output = data.toString();
      console.error(output);
      imageBuildState.logs.push(`ERROR: ${output}`);
    });
    
    await new Promise((resolve, reject) => {
      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Build failed with exit code ${code}`));
        }
      });
    });
    
    imageBuildState.currentStep = 'Verifying image...';
    imageBuildState.progress = 90;
    
    try {
      await getImage(imageName).inspect();
      console.log(`Image ${imageName} built and verified successfully`);
      imageBuildState.isReady = true;
      imageBuildState.progress = 100;
      imageBuildState.currentStep = 'Build complete! Image ready';
    } catch (e) {
      throw new Error(`Image was built but not found: ${e.message}`);
    }
    
  } catch (error) {
    console.error('Failed to build Windows image:', error.message);
    imageBuildState.error = error.message;
    imageBuildState.currentStep = `Build failed: ${error.message}`;
  } finally {
    imageBuildState.isBuilding = false;
  }
}

module.exports = {
  buildWindowsImage
};

