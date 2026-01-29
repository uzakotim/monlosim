import path from 'path'
import { app, ipcMain, screen } from 'electron'
import serve from 'electron-serve'
import Store from 'electron-store'
import { createWindow } from './helpers'
import fs from 'fs/promises';
import os from 'os';
import fsSync from 'fs';

const isProd = process.env.NODE_ENV === 'production'

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

;(async () => {
  await app.whenReady()

  // Load from iCloud on startup
  await loadFromiCloud()

  const mainWindow = createWindow('main', {
  width: 1200,
  height: 800,
  frame: false,
  transparent: true,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
  },
})
  // --- Native Window State Management ---
  // We use native maximize/unmaximize as they provide the most simultaneous animation on macOS.
  
  ipcMain.on('window-control:minimize', () => {
    if (!mainWindow) return;

    if (mainWindow.isMaximized()) {
      // If maximized, restore to original size per user request
      mainWindow.unmaximize();
    } else {
      mainWindow.minimize();
    }
  });

  ipcMain.on('window-control:maximize', () => {
    if (!mainWindow) return;

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  // Native listeners to sync with the renderer
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state-changed', 'maximized');
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state-changed', 'restored');
  });

  ipcMain.on('window-control:close', () => {
    if (mainWindow) mainWindow.close();
  });
  // --- End Window Controls ---

  if (isProd) {
    await mainWindow.loadURL('app://./home')
  } else {
    const port = process.argv[2]
    await mainWindow.loadURL(`http://localhost:${port}/home`)
  }

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

const store = new Store<StoreType>({ name: 'monlosim_cache' });

// Base directory for iCloud
const iCloudDir = path.join(
  os.homedir(),
  'Library',
  'Mobile Documents',
  'com~apple~CloudDocs',
  'Monlosim'
);

// We'll keep track of the current file in the main store or a separate file
// For simplicity, let's use another store to keep track of the current active file
const configStore = new Store({ name: 'monlosim_config' });
let currentFilename = configStore.get('currentFile', 'store.json') as string;

function getFilePath(filename: string) {
  return path.join(iCloudDir, filename);
}

function getLocalFilePath(filename: string) {
  return path.join(os.homedir(), 'Library', 'Application Support', 'Monlosim', filename);
}

// Helper to write JSON safely
async function writeJSON(filePath: string, data: any) {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Failed to write file at ${filePath}:`, err);
  }
}

// Sync current data to files
async function syncToFiles() {
  const iCloudPath = getFilePath(currentFilename);
  const localPath = getLocalFilePath(currentFilename);
  
  const data = store.store;
  await writeJSON(localPath, data);
  writeJSON(iCloudPath, data);
}

store.onDidAnyChange(async () => {
  await syncToFiles();
});

// --- IPC Handlers ---
ipcMain.handle("store:get", (_, key) => {
  return store.get(key);
});

ipcMain.handle("store:set", (_, key, value) => {
  store.set(key, value);
});

ipcMain.handle("store:listFiles", async () => {
  try {
    await fs.mkdir(iCloudDir, { recursive: true });
    const files = await fs.readdir(iCloudDir);
    return files.filter(f => f.endsWith('.json'));
  } catch (err) {
    console.error("Failed to list files:", err);
    return ['store.json'];
  }
});

ipcMain.handle("store:createFile", async (_, filename) => {
  if (!filename.endsWith('.json')) filename += '.json';
  currentFilename = filename;
  configStore.set('currentFile', filename);
  
  // Initialize with empty data
  const defaultData: StoreType = { data: [] };
  store.store = defaultData;
  await syncToFiles();
  return filename;
});

ipcMain.handle("store:loadFile", async (_, filename) => {
  currentFilename = filename;
  configStore.set('currentFile', filename);
  await loadActiveFile();
  return filename;
});

ipcMain.handle("store:getCurrentFile", () => {
  return currentFilename;
});

// --- ---

// Load the active file
async function loadActiveFile() {
  const iCloudPath = getFilePath(currentFilename);
  const localPath = getLocalFilePath(currentFilename);

  let fileToLoad: string | null = null;

  if (fsSync.existsSync(iCloudPath)) {
    fileToLoad = iCloudPath;
  } else if (fsSync.existsSync(localPath)) {
    fileToLoad = localPath;
  }

  if (!fileToLoad) {
    console.warn(`No file found for ${currentFilename}. Initializing empty.`);
    store.store = { data: [] };
    return;
  }

  try {
    const data = await fs.readFile(fileToLoad, 'utf8');
    store.store = JSON.parse(data);
    console.log(`Loaded store from ${fileToLoad}`);
  } catch (err) {
    console.error(`Failed to load store from ${fileToLoad}:`, err);
    store.store = { data: [] };
  }
}

// Optionally sync back
async function loadFromiCloud() {
  await loadActiveFile();
}