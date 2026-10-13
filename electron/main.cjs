const { app, BrowserWindow, ipcMain, clipboard, Tray, Menu, nativeImage, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const si = require('systeminformation');
const { HardwareBridge } = require('./hardwareBridge.cjs');
const {
  isStartupSupported,
  isStartupEnabled,
  setStartupEnabled,
  wasLaunchedHidden,
} = require('./startup.cjs');

const isDev = !app.isPackaged;

let hardwareInfoPromise = null;
let mainWindow = null;
let tray = null;
const bridge = new HardwareBridge();
let shuttingDown = false;
let isQuitting = false;

function getPrefsPath() {
  return path.join(app.getPath('userData'), 'prefs.json');
}

function loadPrefs() {
  try {
    return JSON.parse(fs.readFileSync(getPrefsPath(), 'utf-8'));
  } catch {
    return {};
  }
}

function savePrefs(prefs) {
  try {
    fs.writeFileSync(getPrefsPath(), JSON.stringify(prefs));
  } catch {
    // preference just won't persist
  }
}

function getDisplayPrefs(prefs = loadPrefs()) {
  return {
    enabled: prefs.displayEnabled !== false, // default: on
    source: prefs.displaySource === 'gpu' ? 'gpu' : 'cpu',
  };
}

ipcMain.handle('settings:get', async () => {
  const prefs = loadPrefs();
  return {
    minimizeToTray: prefs.minimizeToTray !== false,
    display: getDisplayPrefs(prefs),
    startWithWindows: await isStartupEnabled(),
    startWithWindowsSupported: isStartupSupported(),
  };
});

ipcMain.handle('settings:setStartWithWindows', (_event, value) => setStartupEnabled(Boolean(value)));

const TITLE_BAR_HEIGHT = 40;

function windowTheme(theme) {
  return theme === 'dark'
    ? { background: '#12131b', symbols: '#f1f1f7' }
    : { background: '#e7e6ef', symbols: '#1c1e2e' };
}

function titleBarOverlayFor(theme) {
  return { color: '#00000000', symbolColor: windowTheme(theme).symbols, height: TITLE_BAR_HEIGHT };
}

// The renderer owns the light/dark choice; mirror it on the native window buttons.
ipcMain.handle('window:setTheme', (_event, theme) => {
  if (!mainWindow) return;
  mainWindow.setTitleBarOverlay(titleBarOverlayFor(theme));
  mainWindow.setBackgroundColor(windowTheme(theme).background);
});

ipcMain.handle('settings:setMinimizeToTray', (_event, value) => {
  savePrefs({ ...loadPrefs(), minimizeToTray: Boolean(value) });
});

ipcMain.handle('settings:setDisplay', (_event, { enabled, source }) => {
  const prefs = { ...loadPrefs(), displayEnabled: Boolean(enabled), displaySource: source };
  savePrefs(prefs);
  bridge.setDisplay(getDisplayPrefs(prefs));
});

async function collectHardwareInfo() {
  const [cpu, graphics] = await Promise.all([si.cpu(), si.graphics()]);
  return {
    cpu: {
      manufacturer: cpu.manufacturer,
      brand: cpu.brand,
      physicalCores: cpu.physicalCores,
      cores: cpu.cores,
      speed: cpu.speed,
    },
    gpus: graphics.controllers
      .filter((c) => c.model)
      .map((c) => ({
        vendor: c.vendor,
        model: c.model,
        vram: typeof c.vram === 'number' && c.vram > 0 ? c.vram : null,
      })),
  };
}

ipcMain.handle('hardware:info', async () => {
  if (!hardwareInfoPromise) {
    hardwareInfoPromise = collectHardwareInfo().catch((err) => {
      hardwareInfoPromise = null;
      throw err;
    });
  }
  return hardwareInfoPromise;
});

async function readDiagnostics() {
  try {
    const diagnosticsPath = path.join(app.getPath('localAppData'), 'FanFlow', 'diagnostics.json');
    return await fs.promises.readFile(diagnosticsPath, 'utf-8');
  } catch {
    return null;
  }
}

ipcMain.handle('hardware:getDiagnostics', () => readDiagnostics());

// Renderer's navigator.clipboard is blocked by default without an explicit permission
// handler; go through Electron's own clipboard module in the main process instead.
ipcMain.handle('hardware:copyDiagnostics', async () => {
  const diag = await readDiagnostics();
  if (!diag) return false;
  clipboard.writeText(diag);
  return true;
});

ipcMain.handle('hardware:getSnapshot', () => ({
  status: bridge.lastStatus,
  data: bridge.lastUpdate,
}));

ipcMain.handle('hardware:setFanPercent', (_event, { id, percent }) => {
  bridge.setFanPercent(id, percent);
});

ipcMain.handle('hardware:setFanAuto', (_event, { id }) => {
  bridge.setFanAuto(id);
});

ipcMain.handle('hardware:cleanMemory', (_event, operations) => bridge.cleanMemory(operations));

function createTray() {
  if (tray) return;
  const image = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png'));
  tray = new Tray(image);
  tray.setToolTip('FanFlow');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Mostrar FanFlow', click: () => mainWindow?.show() },
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', () => mainWindow?.show());
}

function handleWindowClose(event) {
  if (isQuitting) return;

  const prefs = loadPrefs();
  const minimizeToTray = prefs.minimizeToTray !== false; // default: on

  if (minimizeToTray) {
    event.preventDefault();
    mainWindow.hide();
  } else {
    isQuitting = true;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: windowTheme(nativeTheme.shouldUseDarkColors ? 'dark' : 'light').background,
    // Replace the native (accent-coloured) title bar with the app's own: the page draws
    // the bar and Windows keeps its real min/max/close buttons, snap layouts and
    // rounded corners on top of it.
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarOverlayFor(nativeTheme.shouldUseDarkColors ? 'dark' : 'light'),
    accentColor: false,
    title: 'FanFlow',
    // Auto-started at logon: stay in the tray so the cooler display and fan curves
    // run without a window popping up on every boot.
    show: !wasLaunchedHidden(),
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'tray-icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.on('close', handleWindowClose);

  createTray();

  bridge.start({
    onUpdate: (payload) => mainWindow?.webContents.send('hardware:update', payload),
    onStatus: (payload) => mainWindow?.webContents.send('hardware:status', payload),
  });
  bridge.setDisplay(getDisplayPrefs());

  if (isDev) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL || 'http://localhost:5183');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// Windows only shows renderer notifications (critical-temperature alerts) for an app
// with an AppUserModelID; match the installer's appId.
app.setAppUserModelId('com.fanflow.app');

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Release every fan back to BIOS/default control before the process actually exits,
// so a closed app never leaves a fan stuck at whatever percent it last commanded.
app.on('before-quit', (event) => {
  if (shuttingDown) return;
  shuttingDown = true;
  event.preventDefault();
  bridge.shutdown().finally(() => app.exit(0));
});
