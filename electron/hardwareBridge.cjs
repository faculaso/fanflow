const { spawn } = require('node:child_process');
const readline = require('node:readline');
const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');

function resolveHelperPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'hardware-helper', 'FanFlowHardwareHelper.exe');
  }
  return path.join(
    __dirname,
    '../hardware-helper/bin/Release/net9.0/win-x64/publish/FanFlowHardwareHelper.exe',
  );
}

class HardwareBridge {
  constructor() {
    this.child = null;
    this.shuttingDown = false;
    this.onUpdate = null;
    this.onStatus = null;
    // The renderer may not have mounted its listeners yet when the very first status
    // arrives (spawn failures in particular can fire within milliseconds), and
    // webContents.send() silently drops messages sent before a listener exists. Keep
    // the latest snapshot so the renderer can pull it once it's actually ready.
    this.lastStatus = null;
    this.lastUpdate = null;
    this.pendingMemoryCleans = new Map();
    this.nextRequestId = 1;
  }

  emitStatus(payload) {
    this.lastStatus = payload;
    this.onStatus?.(payload);
  }

  emitUpdate(payload) {
    this.lastUpdate = payload;
    this.onUpdate?.(payload);
  }

  start({ onUpdate, onStatus }) {
    this.onUpdate = onUpdate;
    this.onStatus = onStatus;

    const exePath = resolveHelperPath();
    if (!fs.existsSync(exePath)) {
      this.emitStatus({ admin: false, ok: false, error: 'helper-missing' });
      return;
    }

    // A UAC-elevated launch commonly starts the parent process with C:\Windows\System32
    // as its working directory instead of the app's own folder. Without an explicit cwd
    // here, the helper inherits that, and LibreHardwareMonitorLib's driver extraction
    // (which resolves paths relative to the working directory) fails silently — sensors
    // needing raw hardware access (CPU temp, SuperIO fans) come back empty while
    // driver-independent ones (GPU via vendor API, CPU load) still work.
    this.child = spawn(exePath, [], { windowsHide: true, cwd: path.dirname(exePath) });

    const rl = readline.createInterface({ input: this.child.stdout });
    rl.on('line', (line) => {
      line = line.trim();
      if (!line) return;
      let payload;
      try {
        payload = JSON.parse(line);
      } catch {
        return;
      }
      if (payload.type === 'update') this.emitUpdate(payload);
      else if (payload.type === 'status') this.emitStatus(payload);
      else if (payload.type === 'memoryCleaned') this.resolveMemoryClean(payload);
      else if (payload.type === 'error') this.emitStatus({ ...this.lastStatus, ok: true, warning: payload.message });
    });

    this.child.on('exit', () => {
      if (!this.shuttingDown) {
        this.emitStatus({ admin: false, ok: false, error: 'helper-exited' });
      }
      this.child = null;
    });

    this.child.on('error', () => {
      this.emitStatus({ admin: false, ok: false, error: 'helper-spawn-failed' });
      this.child = null;
    });
  }

  send(command) {
    if (!this.child || this.child.exitCode !== null || !this.child.stdin.writable) return;
    this.child.stdin.write(`${JSON.stringify(command)}\n`);
  }

  setFanPercent(id, percent) {
    this.send({ type: 'setPercent', id, percent });
  }

  setFanAuto(id) {
    this.send({ type: 'setAuto', id });
  }

  /**
   * Asks the elevated helper to purge memory lists (working sets, standby, modified,
   * file cache). Resolves with { ok, freed, results } once the helper reports back.
   */
  cleanMemory(operations) {
    if (!this.child || this.child.exitCode !== null) {
      return Promise.resolve({ ok: false, error: 'helper-unavailable', freed: 0, availableGained: 0, results: [] });
    }
    const requestId = String(this.nextRequestId++);
    return new Promise((resolve) => {
      // Emptying working sets on a loaded system can take a while, but never forever.
      const timeout = setTimeout(() => {
        this.pendingMemoryCleans.delete(requestId);
        resolve({ ok: false, error: 'timeout', freed: 0, availableGained: 0, results: [] });
      }, 60_000);
      this.pendingMemoryCleans.set(requestId, (result) => {
        clearTimeout(timeout);
        resolve(result);
      });
      this.send({ type: 'cleanMemory', requestId, operations });
    });
  }

  resolveMemoryClean({ requestId, ok, error, freed, availableGained, results }) {
    const resolve = this.pendingMemoryCleans.get(requestId);
    if (!resolve) return;
    this.pendingMemoryCleans.delete(requestId);
    resolve({ ok, error, freed, availableGained, results });
  }

  /** Configures the cooler's temperature display (USB HID 5131:2007). */
  setDisplay({ enabled, source }) {
    this.send({ type: 'setDisplay', enabled, source });
  }

  /** Releases every fan control back to BIOS/default before the app exits. */
  shutdown() {
    return new Promise((resolve) => {
      if (!this.child || this.child.exitCode !== null) {
        resolve();
        return;
      }
      this.shuttingDown = true;
      const child = this.child;
      const timeout = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // already gone
        }
        resolve();
      }, 1500);
      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
      try {
        child.stdin.write(`${JSON.stringify({ type: 'shutdown' })}\n`);
      } catch {
        clearTimeout(timeout);
        resolve();
      }
    });
  }
}

module.exports = { HardwareBridge };
