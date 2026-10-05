const { execFile } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');

// FanFlow runs elevated (requireAdministrator), and Windows silently skips elevated
// executables listed under the HKCU Run key that app.setLoginItemSettings() writes to.
// A logon-triggered scheduled task with "highest privileges" is the supported way to
// auto-start an elevated app without a UAC prompt at every boot.
const TASK_NAME = 'FanFlow';
const HIDDEN_ARG = '--hidden';

function runSchtasks(args) {
  return new Promise((resolve) => {
    execFile('schtasks.exe', args, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({ ok: !error, output: `${stdout}${stderr}`.trim() });
    });
  });
}

/** The portable build runs from a temp extraction; launch the original .exe instead. */
function getLaunchPath() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function xmlEscape(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildTaskXml() {
  const user = `${process.env.USERDOMAIN || os.hostname()}\\${process.env.USERNAME || os.userInfo().username}`;
  const exe = getLaunchPath();
  // schtasks /Create's plain flags would leave the default 72h execution time limit
  // (Task Scheduler would kill FanFlow after 3 days of uptime) and the "don't start /
  // stop on battery" conditions, so the task is defined via XML instead.
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Inicia FanFlow al iniciar sesión.</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>${xmlEscape(user)}</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${xmlEscape(user)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>5</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${xmlEscape(exe)}</Command>
      <Arguments>${HIDDEN_ARG}</Arguments>
      <WorkingDirectory>${xmlEscape(path.dirname(exe))}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`;
}

/** Only an installed/portable build has a stable .exe to register; dev runs electron.exe. */
function isStartupSupported() {
  return app.isPackaged && process.platform === 'win32';
}

async function isStartupEnabled() {
  if (!isStartupSupported()) return false;
  const { ok } = await runSchtasks(['/Query', '/TN', TASK_NAME]);
  return ok;
}

async function setStartupEnabled(enabled) {
  if (!isStartupSupported()) return false;

  if (!enabled) {
    await runSchtasks(['/Delete', '/TN', TASK_NAME, '/F']);
    return isStartupEnabled();
  }

  const xmlPath = path.join(app.getPath('temp'), 'fanflow-startup-task.xml');
  try {
    // schtasks /XML expects UTF-16 LE with a BOM, matching the XML declaration.
    fs.writeFileSync(xmlPath, `﻿${buildTaskXml()}`, 'utf16le');
    await runSchtasks(['/Create', '/TN', TASK_NAME, '/XML', xmlPath, '/F']);
  } finally {
    fs.rmSync(xmlPath, { force: true });
  }
  return isStartupEnabled();
}

function wasLaunchedHidden() {
  return process.argv.includes(HIDDEN_ARG);
}

module.exports = { isStartupSupported, isStartupEnabled, setStartupEnabled, wasLaunchedHidden };
