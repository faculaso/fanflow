const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hardware', {
  getInfo: () => ipcRenderer.invoke('hardware:info'),
  getSnapshot: () => ipcRenderer.invoke('hardware:getSnapshot'),
  getDiagnostics: () => ipcRenderer.invoke('hardware:getDiagnostics'),
  copyDiagnostics: () => ipcRenderer.invoke('hardware:copyDiagnostics'),

  onUpdate: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('hardware:update', listener);
    return () => ipcRenderer.removeListener('hardware:update', listener);
  },

  onStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('hardware:status', listener);
    return () => ipcRenderer.removeListener('hardware:status', listener);
  },

  setFanPercent: (id, percent) => ipcRenderer.invoke('hardware:setFanPercent', { id, percent }),
  setFanAuto: (id) => ipcRenderer.invoke('hardware:setFanAuto', { id }),
  cleanMemory: (operations) => ipcRenderer.invoke('hardware:cleanMemory', operations),
});

contextBridge.exposeInMainWorld('settings', {
  get: () => ipcRenderer.invoke('settings:get'),
  setMinimizeToTray: (value) => ipcRenderer.invoke('settings:setMinimizeToTray', value),
  setDisplay: (config) => ipcRenderer.invoke('settings:setDisplay', config),
  setStartWithWindows: (value) => ipcRenderer.invoke('settings:setStartWithWindows', value),
  setKeyboard: (config) => ipcRenderer.invoke('settings:setKeyboard', config),
});

contextBridge.exposeInMainWorld('keyboardScreen', {
  syncTime: (model) => ipcRenderer.invoke('keyboard:syncTime', model),
  upload: (model, frames, delays) => ipcRenderer.invoke('keyboard:upload', { model, frames, delays }),
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('keyboard:progress', listener);
    return () => ipcRenderer.removeListener('keyboard:progress', listener);
  },
});

contextBridge.exposeInMainWorld('appWindow', {
  setTheme: (theme) => ipcRenderer.invoke('window:setTheme', theme),
});
