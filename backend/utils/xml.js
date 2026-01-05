const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

/**
 * Parse and inject custom scripts into autounattend.xml
 */
async function parseAndInjectScripts(version, vmStoragePath, scripts) {
  const xmlFiles = {
    '7': 'win7x64.xml',
    '8': 'win81x64.xml',
    '10': 'win10x64.xml',
    '11': 'win11x64.xml'
  };
  
  const xmlFileName = xmlFiles[version] || 'win11x64.xml';
  const sourcePath = path.join('/app/vm-builder/assets', xmlFileName);
  const targetDir = path.join(vmStoragePath, 'oem');
  const targetPath = path.join(targetDir, 'autounattend.xml');
  
  fs.mkdirSync(targetDir, { recursive: true });
  
  // If no scripts provided, just copy the base XML
  if (!scripts || Object.keys(scripts).length === 0) {
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`Base autounattend.xml copied to: ${targetPath}`);
    return targetPath;
  }
  
  // Create script files first
  createScriptFiles(vmStoragePath, scripts);
  
  // Read and parse the source XML
  const xmlContent = fs.readFileSync(sourcePath, 'utf8');
  const parser = new xml2js.Parser();
  const builder = new xml2js.Builder();
  const xmlDoc = await parser.parseStringPromise(xmlContent);
  
  if (!xmlDoc.unattend || !xmlDoc.unattend.settings) {
    throw new Error('Invalid autounattend XML structure');
  }
  
  let scriptCounter = 1;
  
  // System scripts (specialize pass)
  if (scripts.system && scripts.system.length > 0) {
    const specializePass = findOrCreateSettingsPass(xmlDoc, 'specialize');
    const runSync = findOrCreateRunSynchronous(specializePass);
    
    scripts.system.forEach(script => {
      const command = buildScriptCommand(script, scriptCounter++);
      runSync.RunSynchronousCommand.push(command);
    });
  }
  
  // FirstLogon scripts
  if (scripts.firstLogon && scripts.firstLogon.length > 0) {
    const oobePass = findOrCreateSettingsPass(xmlDoc, 'oobeSystem');
    const firstLogonCommands = findOrCreateFirstLogonCommands(oobePass);
    
    scripts.firstLogon.forEach(script => {
      const command = buildScriptCommand(script, scriptCounter++);
      firstLogonCommands.SynchronousCommand.push(command);
    });
  }
  
  // Build and save the modified XML
  const modifiedXml = builder.buildObject(xmlDoc);
  fs.writeFileSync(targetPath, modifiedXml);
  
  console.log(`Custom autounattend.xml created at: ${targetPath}`);
  return targetPath;
}

/**
 * Create script files in oem/scripts directory
 */
function createScriptFiles(vmStoragePath, scripts) {
  const scriptsDir = path.join(vmStoragePath, 'oem', 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  
  let scriptCounter = 1;
  
  ['system', 'firstLogon'].forEach(scriptType => {
    if (scripts[scriptType] && Array.isArray(scripts[scriptType])) {
      scripts[scriptType].forEach(script => {
        const scriptName = `unattend-${String(scriptCounter).padStart(2, '0')}.${script.type}`;
        const scriptPath = path.join(scriptsDir, scriptName);
        fs.writeFileSync(scriptPath, script.content, 'utf8');
        scriptCounter++;
      });
    }
  });
}

function findOrCreateSettingsPass(xmlDoc, passName) {
  let pass = xmlDoc.unattend.settings.find(s => s.$.pass === passName);
  if (!pass) {
    pass = { $: { pass: passName }, component: [] };
    xmlDoc.unattend.settings.push(pass);
  }
  return pass;
}

function findOrCreateRunSynchronous(passSettings) {
  let component = passSettings.component.find(c => 
    c.$.name === 'Microsoft-Windows-Deployment'
  );
  
  if (!component) {
    component = {
      $: {
        name: 'Microsoft-Windows-Deployment',
        processorArchitecture: 'amd64',
        publicKeyToken: '31bf3856ad364e35',
        language: 'neutral',
        versionScope: 'nonSxS'
      },
      RunSynchronous: [{ RunSynchronousCommand: [] }]
    };
    passSettings.component.push(component);
  }
  
  if (!component.RunSynchronous || !component.RunSynchronous[0]) {
    component.RunSynchronous = [{ RunSynchronousCommand: [] }];
  }
  
  return component.RunSynchronous[0];
}

function findOrCreateFirstLogonCommands(passSettings) {
  let component = passSettings.component.find(c => 
    c.$.name === 'Microsoft-Windows-Shell-Setup'
  );
  
  if (!component) {
    component = {
      $: {
        name: 'Microsoft-Windows-Shell-Setup',
        processorArchitecture: 'amd64',
        publicKeyToken: '31bf3856ad364e35',
        language: 'neutral',
        versionScope: 'nonSxS'
      },
      FirstLogonCommands: [{ SynchronousCommand: [] }]
    };
    passSettings.component.push(component);
  }
  
  if (!component.FirstLogonCommands || !component.FirstLogonCommands[0]) {
    component.FirstLogonCommands = [{ SynchronousCommand: [] }];
  }
  
  return component.FirstLogonCommands[0];
}

function buildScriptCommand(script, order) {
  const scriptName = `unattend-${String(order).padStart(2, '0')}.${script.type}`;
  const scriptPath = `C:\\Windows\\Setup\\Scripts\\${scriptName}`;
  
  let commandPath;
  switch (script.type) {
    case 'cmd':
      commandPath = scriptPath;
      break;
    case 'ps1':
      commandPath = `powershell.exe -WindowStyle Normal -NoProfile -Command "Get-Content -LiteralPath '${scriptPath}' -Raw | Invoke-Expression;"`;
      break;
    case 'reg':
      commandPath = `reg.exe import "${scriptPath}"`;
      break;
    case 'vbs':
      commandPath = `cscript.exe //E:vbscript "${scriptPath}"`;
      break;
    case 'js':
      commandPath = `cscript.exe //E:jscript "${scriptPath}"`;
      break;
    default:
      commandPath = scriptPath;
  }
  
  return {
    $: { 'wcm:action': 'add' },
    Order: [order],
    Path: [commandPath],
    Description: [`Custom ${script.type} script`]
  };
}

module.exports = {
  parseAndInjectScripts
};

