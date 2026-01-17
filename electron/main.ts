const { app, BrowserWindow, globalShortcut, desktopCapturer, ipcMain, screen, systemPreferences, nativeImage } = require('electron')
const path = require('path')

const SIDEBAR_WIDTH = 420

let mainWindow: any = null

// Check screen recording permission on macOS
function checkScreenCapturePermission(): boolean {
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('screen')
    console.log('Screen recording permission status:', status)
    return status === 'granted'
  }
  return true
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  mainWindow = new BrowserWindow({
    width: 420,
    height: screenHeight,
    x: screenWidth - 420,
    y: 0,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    hasShadow: true,
    backgroundColor: '#0a0e17',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Load the app - always use dev server in dev mode
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Toggle window visibility
function toggleWindow() {
  if (mainWindow) {
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  }
}

// Screen capture handler - captures screen excluding the sidebar
ipcMain.handle('capture-screen', async () => {
  try {
    // Get actual screen dimensions for proper cropping
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.size
    const scaleFactor = primaryDisplay.scaleFactor || 1
    
    // Capture at 1440x900 - good balance for Claude vision (clear enough to read UI)
    const captureWidth = 1440
    const captureHeight = 900
    
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: captureWidth, height: captureHeight }
    })

    console.log('Found screen sources:', sources.length)

    if (sources.length > 0) {
      const fullScreenshot = sources[0].thumbnail
      const size = fullScreenshot.getSize()
      
      // Calculate crop: exclude sidebar proportionally
      // Sidebar is 420px on actual screen, calculate ratio
      const sidebarRatio = SIDEBAR_WIDTH / screenWidth
      const cropWidth = Math.floor(size.width * (1 - sidebarRatio))
      
      if (cropWidth > 0) {
        const croppedScreenshot = fullScreenshot.crop({
          x: 0,
          y: 0,
          width: cropWidth,
          height: size.height
        })
        
        const base64 = croppedScreenshot.toDataURL()
        console.log(`Screenshot: ${cropWidth}x${size.height}, base64 length: ${base64.length}`)
        return base64
      }
      
      const base64 = fullScreenshot.toDataURL()
      console.log('Screenshot captured (full), size:', base64.length)
      return base64
    }
    return null
  } catch (error) {
    console.error('Screen capture error:', error)
    return null
  }
})

// Window control handlers
ipcMain.handle('minimize-window', () => {
  mainWindow?.minimize()
})

ipcMain.handle('close-window', () => {
  mainWindow?.hide()
})

ipcMain.handle('toggle-window', () => {
  toggleWindow()
})

// Trigger guidance check (send to renderer)
function triggerGuidanceCheck() {
  if (mainWindow && mainWindow.webContents) {
    console.log('Hotkey triggered: checking screen for guidance')
    mainWindow.webContents.send('trigger-guidance-check')
    // Also show the window if hidden
    if (!mainWindow.isVisible()) {
      mainWindow.show()
    }
  }
}

app.whenReady().then(() => {
  createWindow()

  // Register global shortcut: Cmd/Ctrl+Shift+G to toggle window
  const toggleShortcut = process.platform === 'darwin' ? 'Command+Shift+G' : 'Control+Shift+G'
  globalShortcut.register(toggleShortcut, toggleWindow)
  
  // Register global shortcut: Cmd/Ctrl+Shift+Space to trigger guidance check
  const checkShortcut = process.platform === 'darwin' ? 'Command+Shift+Space' : 'Control+Shift+Space'
  globalShortcut.register(checkShortcut, triggerGuidanceCheck)
  
  console.log(`Registered shortcuts: ${toggleShortcut} (toggle), ${checkShortcut} (check)`)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
