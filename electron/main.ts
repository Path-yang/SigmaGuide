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
    // Use smaller thumbnail for faster processing (1024x768 is enough for analysis)
    // This significantly reduces token count and API latency
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1024, height: 768 }
    })

    console.log('Found screen sources:', sources.length)

    if (sources.length > 0) {
      const fullScreenshot = sources[0].thumbnail
      const size = fullScreenshot.getSize()
      
      // Calculate crop area: exclude the sidebar on the right (proportional to thumbnail)
      // Sidebar is ~420px on a 1920 screen, so roughly 22% of width
      const sidebarRatio = SIDEBAR_WIDTH / 1920
      const cropWidth = Math.floor(size.width * (1 - sidebarRatio))
      
      if (cropWidth > 0) {
        // Crop the screenshot to exclude sidebar
        const croppedScreenshot = fullScreenshot.crop({
          x: 0,
          y: 0,
          width: cropWidth,
          height: size.height
        })
        
        const base64 = croppedScreenshot.toDataURL()
        console.log('Screenshot captured, size:', base64.length)
        return base64
      }
      
      // Fallback to full screenshot if crop fails
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

app.whenReady().then(() => {
  createWindow()

  // Register global shortcut: Cmd/Ctrl+Shift+G
  const shortcut = process.platform === 'darwin' ? 'Command+Shift+G' : 'Control+Shift+G'
  globalShortcut.register(shortcut, toggleWindow)

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
