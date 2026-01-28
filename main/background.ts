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
  // --- Manual Window State Management (The Fix) ---

  // Use a variable to track if *we* are currently maximized via the custom button
  let isMaximizedManually = false;
  // Initialize originalBounds to the startup dimensions
  let originalBounds = { x: 0, y: 0, width: 1200, height: 800 }; 
  
  // Wait for the window to actually finish loading/showing before capturing initial accurate position/bounds
  mainWindow.once('ready-to-show', () => {
    originalBounds = mainWindow.getBounds();
  });

  mainWindow.on('resize', () => {
    if (!isMaximizedManually) {
      originalBounds = mainWindow.getBounds();
    }
  });

  mainWindow.on('move', () => {
    if (!isMaximizedManually) {
      originalBounds = mainWindow.getBounds();
    }
  });


  ipcMain.on('window-control:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window-control:maximize', () => {
    if (!mainWindow) return;

    if (isMaximizedManually) {
      // Restore the window using the saved bounds
      mainWindow.setBounds(originalBounds, true);
      isMaximizedManually = false;
      mainWindow.webContents.send('window-state-changed', 'restored');
    } else {
      // Maximize the window manually
      // 1. Save current bounds before we change them
      originalBounds = mainWindow.getBounds(); 

      // 2. Get the screen's usable work area
      const display = screen.getDisplayNearestPoint(mainWindow.getBounds());
      const workArea = display.workArea;
      
      // 3. Set window bounds to the work area
      mainWindow.setBounds(workArea, true);
      isMaximizedManually = true;
      mainWindow.webContents.send('window-state-changed', 'maximized');
    }
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

const store = new Store<StoreType>({ name: 'monlosim_data' });

// Paths
const localFile = path.join(os.homedir(), 'Library', 'Application Support', 'Monlosim', 'store.json');
const iCloudFile = path.join(
  os.homedir(),
  'Library',
  'Mobile Documents',
  'com~apple~CloudDocs',
  'Monlosim',
  'store.json'
);

// Helper to write JSON safely
async function writeJSON(filePath: string, data: any) {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Failed to write file at ${filePath}:`, err);
  }
}

store.onDidAnyChange(async () => {
  // Always write locally first
  await writeJSON(localFile, store.store);

  // Then try to copy to iCloud (non-blocking)
  writeJSON(iCloudFile, store.store);
});

// --- IPC Handlers ---
ipcMain.handle("store:get", (_, key) => {
  return store.get(key);
});

ipcMain.handle("store:set", (_, key, value) => {
  store.set(key, value);
});

// --- ---


// Optionally sync back
async function loadFromiCloud() {
  let fileToLoad: string | null = null;

  if (fsSync.existsSync(iCloudFile)) {
    fileToLoad = iCloudFile;
  } else if (fsSync.existsSync(localFile)) {
    fileToLoad = localFile;
  }

  if (!fileToLoad) {
    console.warn('No store file found in iCloud or local storage.');
    return;
  }

  try {
    const data = await fs.readFile(fileToLoad, 'utf8');
    store.store = JSON.parse(data);
    console.log(`Loaded store from ${fileToLoad}`);
  } catch (err) {
    console.error(`Failed to load store from ${fileToLoad}:`, err);
  }
}