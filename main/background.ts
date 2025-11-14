import path from 'path'
import { app, ipcMain } from 'electron'
import serve from 'electron-serve'
import Store from 'electron-store'
import { createWindow } from './helpers'
import fs from 'fs';
import os from 'os';

const isProd = process.env.NODE_ENV === 'production'

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

;(async () => {
  await app.whenReady()

  const mainWindow = createWindow('main', {
    width: 1000,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  if (isProd) {
    await mainWindow.loadURL('app://./home')
  } else {
    const port = process.argv[2]
    await mainWindow.loadURL(`http://localhost:${port}/home`)
    mainWindow.webContents.openDevTools()
  }
  // Load from iCloud on startup
  loadFromiCloud()

})()

app.on('window-all-closed', () => {
  app.quit()
})

type RowType = {
  id: number
  monthYear: string   // "MMMM yyyy"
  income: number
  expenses: number 
}
type StoreType = {
  data: RowType[]
}

const store = new Store<StoreType>({ name: 'monlosim_data' })
const iCloudFile = path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Monlosim', 'store.json');
// Write to iCloud whenever the store changes
store.onDidAnyChange(() => {
  try {
    fs.mkdirSync(path.dirname(iCloudFile), { recursive: true })
    fs.writeFileSync(iCloudFile, JSON.stringify(store.store, null, 2))
  } catch (err) {
    console.error('Failed to write iCloud file:', err)
  }
})


// --- IPC Handlers ---
ipcMain.handle("store:get", (_, key) => {
  return store.get(key);
});

ipcMain.handle("store:set", (_, key, value) => {
  store.set(key, value);
});

// --- ---


// Optionally sync back
function loadFromiCloud() {
  if (fs.existsSync(iCloudFile)) {
    const data = JSON.parse(fs.readFileSync(iCloudFile, 'utf8'));
    store.store = data;
  }
}