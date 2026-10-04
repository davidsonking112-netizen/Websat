const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 980,
    minHeight: 700,
    backgroundColor: '#f7f4ee',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (process.env.WEBSAT_DEV === '1') {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadURL(pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).toString());
  }

  win.webContents.on('will-navigate', (event, navigationUrl) => {
    const packagedUrl = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).toString();
    const allowed = process.env.WEBSAT_DEV === '1'
      ? navigationUrl === 'http://localhost:5173/'
      : navigationUrl === packagedUrl;
    if (!allowed) event.preventDefault();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
          }
        }
      };
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:') {
        setImmediate(() => shell.openExternal(parsed.toString()));
      }
    } catch (_) {}

    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
