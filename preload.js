const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  startBots: (botAccounts) => ipcRenderer.invoke('start-bots', botAccounts),
  stopBots: () => ipcRenderer.invoke('stop-bots'),
  getOnlineCount: () => ipcRenderer.invoke('get-online-count'),
  onBotStatus: (callback) => ipcRenderer.on('bot-status', (_, data) => callback(data)),
  onBotLog: (callback) => ipcRenderer.on('bot-log', (_, msg) => callback(msg))
});
