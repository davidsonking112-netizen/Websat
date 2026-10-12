const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('forgeDesktop', {
  isDesktop: true,
  hasSecret: () => ipcRenderer.invoke('forge:has-secret'),
  setSecret: (value) => ipcRenderer.invoke('forge:set-secret', value),
  requestProvider: (request) => ipcRenderer.invoke('forge:provider-request', request),
  requestMcp: (request) => ipcRenderer.invoke('forge:mcp-request', request),
  abortRemoteRequest: (requestId) => ipcRenderer.send('forge:remote-abort', String(requestId || '').slice(0, 120)),
  openFiles: () => ipcRenderer.invoke('forge:open-files'),
  notify: (title, body) => ipcRenderer.send('forge:notify', title, body),
  onMenuAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('forge-menu-action', listener);
    return () => ipcRenderer.removeListener('forge-menu-action', listener);
  }
});
