const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('forgeDesktop', {
  isDesktop: true,
  getSecret: () => ipcRenderer.invoke('forge:get-secret'),
  setSecret: (value) => ipcRenderer.invoke('forge:set-secret', value),
  openFiles: () => ipcRenderer.invoke('forge:open-files'),
  notify: (title, body) => ipcRenderer.send('forge:notify', title, body),
  onMenuAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('forge-menu-action', listener);
    return () => ipcRenderer.removeListener('forge-menu-action', listener);
  }
});
