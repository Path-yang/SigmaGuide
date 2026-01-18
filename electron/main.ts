const { app, BrowserWindow, globalShortcut, desktopCapturer, ipcMain, screen: electronScreen, systemPreferences, nativeImage, Tray, Menu } = require('electron')
const path = require('path')
const { execFile, spawn } = require('child_process')
const { promisify } = require('util')
const execFileAsync = promisify(execFile)

const WINDOW_WIDTH = 700
const WINDOW_MAX_HEIGHT = 800
const FIXED_HIGHLIGHT_RADIUS = 30 // Fixed radius for blue circle highlight (pixels)

let mainWindow: any = null
let overlayWindow: any = null
let tray: any = null
let captureInProgress = false // Lock to prevent concurrent captures
let clickMonitorProcess: any = null // Process monitoring mouse clicks

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
  const primaryDisplay = electronScreen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  // Calculate centered position
  const x = Math.floor((screenWidth - WINDOW_WIDTH) / 2)
  const y = Math.floor((screenHeight - WINDOW_MAX_HEIGHT) / 2)

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_MAX_HEIGHT,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    minWidth: 600,
    maxWidth: 900,
    minHeight: 400,
    maxHeight: WINDOW_MAX_HEIGHT,
    skipTaskbar: true,
    hasShadow: true,
    backgroundColor: '#00000000', // Transparent
    vibrancy: 'ultra-dark', // macOS blur effect
    visualEffectState: 'active',
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

  // Hide window initially
  mainWindow.hide()

  // Handle window blur - hide when clicking outside (optional, can be disabled)
  mainWindow.on('blur', () => {
    // Don't hide if we're in the middle of capturing screen (prevents race condition)
    if (captureInProgress) {
      console.log('Blur event ignored - capture in progress')
      return
    }
    // Add a small delay to prevent rapid hide/show cycles
    // This gives time for programmatic focus operations to complete
    setTimeout(() => {
      // Double-check the flag in case it changed during the delay
      if (captureInProgress) {
        return
      }
      // Only hide if window is still blurred and not in dev mode
      if (mainWindow && !mainWindow.isFocused() && !process.env.VITE_DEV_SERVER_URL) {
        mainWindow.hide()
      }
    }, 150)
  })

  // Handle Escape key
  mainWindow.webContents.on('before-input-event', (event: any, input: any) => {
    if (input.key === 'Escape') {
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createOverlayWindow() {
  const primaryDisplay = electronScreen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.size
  const { x: displayX, y: displayY } = primaryDisplay.bounds

  overlayWindow = new BrowserWindow({
    width: screenWidth,
    height: screenHeight,
    x: displayX,
    y: displayY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    hasShadow: false,
    backgroundColor: '#00000000', // Fully transparent
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Ensure overlay stays on top of everything
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Load overlay HTML
  // Use app.getAppPath() to get the correct app path regardless of dev/prod
  const appPath = app.getAppPath()
  const overlayPath = path.join(appPath, 'overlay.html')

  console.log('Loading overlay from:', overlayPath)

  overlayWindow.loadFile(overlayPath).catch((err: any) => {
    console.error('Failed to load overlay.html from file system:', err, 'Path:', overlayPath)
    // Fallback: try relative to __dirname
    const fallbackPath = path.join(__dirname, '../overlay.html')
    console.log('Trying fallback path:', fallbackPath)
    overlayWindow.loadFile(fallbackPath).catch((fallbackErr: any) => {
      console.error('Fallback path also failed:', fallbackErr)
      // Try dev server if available
      if (process.env.VITE_DEV_SERVER_URL) {
        const devServerUrl = process.env.VITE_DEV_SERVER_URL.replace('/index.html', '')
        overlayWindow.loadURL(`${devServerUrl}/overlay.html`).catch((urlErr: any) => {
          console.error('Failed to load overlay.html from dev server:', urlErr)
          // Last resort: create inline HTML
          overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; padding: 0; overflow: hidden; background: transparent; width: 100vw; height: 100vh; }
    #overlay-canvas { display: block; position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
  </style>
</head>
<body>
  <canvas id="overlay-canvas"></canvas>
  <script>
    const canvas = document.getElementById('overlay-canvas');
    const ctx = canvas.getContext('2d');
    function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    const highlights = new Map();
    let animationFrameId = null;
    let pulsePhase = 0;
    const highlightColor = '#3b82f6';
    const highlightBorderWidth = 3;
    const highlightGlowRadius = 20;
    function drawHighlight(id, x, y, width, height, radius) {
      highlights.set(id, { id, x, y, width, height, radius, centerX: x + width / 2, centerY: y + height / 2 });
      requestAnimation();
    }
    function removeHighlight(id) { highlights.delete(id); requestAnimation(); }
    function clearAllHighlights() { highlights.clear(); requestAnimation(); }
    function requestAnimation() {
      if (animationFrameId) return;
      animationFrameId = requestAnimationFrame(animate);
    }
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pulsePhase = (pulsePhase + 0.05) % (Math.PI * 2);
      const pulse = 0.7 + 0.3 * Math.sin(pulsePhase);
      highlights.forEach((highlight) => {
        const { centerX, centerY, radius } = highlight;
        const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.7, centerX, centerY, radius + highlightGlowRadius);
        gradient.addColorStop(0, 'rgba(59, 130, 246, ' + (0.4 * pulse) + ')');
        gradient.addColorStop(0.5, 'rgba(59, 130, 246, ' + (0.2 * pulse) + ')');
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + highlightGlowRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = highlightColor;
        ctx.lineWidth = highlightBorderWidth * pulse;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(59, 130, 246, ' + (0.15 * pulse) + ')';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.8, 0, Math.PI * 2);
        ctx.fill();
      });
      if (highlights.size > 0) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        animationFrameId = null;
      }
    }
    if (window.electronAPI) {
      const showCleanup = window.electronAPI.onShowHighlight?.((data) => {
        drawHighlight(data.id, data.x, data.y, data.width, data.height, data.radius);
      });
      const updateCleanup = window.electronAPI.onUpdateHighlight?.((data) => {
        drawHighlight(data.id, data.x, data.y, data.width, data.height, data.radius);
      });
      const clearCleanup = window.electronAPI.onClearHighlights?.(() => {
        clearAllHighlights();
      });
      window.addEventListener('beforeunload', () => {
        showCleanup?.();
        updateCleanup?.();
        clearCleanup?.();
      });
    }
    requestAnimation();
  </script>
</body>
</html>
        `)}`)
        })
      }
    })
  })

  // Make window click-through (clicks pass through to underlying applications)
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })

  // Hide initially
  overlayWindow.hide()

  // Debug: Log when overlay is ready
  overlayWindow.webContents.on('did-finish-load', () => {
    console.log('Overlay window finished loading')
  })

  overlayWindow.webContents.on('dom-ready', () => {
    console.log('Overlay window DOM ready')
  })

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  console.log('Overlay window created')
}

// Toggle window visibility
function toggleWindow() {
  if (mainWindow) {
    if (mainWindow.isVisible()) {
      // Close DevTools when hiding the window
      mainWindow.webContents.closeDevTools()
      mainWindow.hide()
    } else {
      // Center window on current display
      const primaryDisplay = electronScreen.getPrimaryDisplay()
      const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
      const x = Math.floor((screenWidth - WINDOW_WIDTH) / 2)
      const y = Math.floor((screenHeight - WINDOW_MAX_HEIGHT) / 2)

      mainWindow.setPosition(x, y)
      mainWindow.setAlwaysOnTop(true, 'screen-saver')
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      mainWindow.show()
      mainWindow.focus()

      // Focus input field in renderer
      mainWindow.webContents.send('window-shown')
    }
  }
}

// Toggle DevTools
function toggleDevTools() {
  if (mainWindow && mainWindow.webContents) {
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools()
      console.log('DevTools closed')
    } else {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
      console.log('DevTools opened')
    }
  }
}

// Screen capture handler - captures screen excluding the modal window using native macOS APIs
ipcMain.handle('capture-screen', async () => {
  // Prevent concurrent captures
  if (captureInProgress) {
    console.log('Capture already in progress, skipping...')
    return null
  }

  captureInProgress = true

  try {
    // Get actual screen dimensions and scaling
    const primaryDisplay = electronScreen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.size
    const scaleFactor = primaryDisplay.scaleFactor || 1

    // Capture at screen logical dimensions to avoid coordinate scaling
    // This ensures 1:1 mapping between screenshot coordinates and screen coordinates
    const captureWidth = screenWidth
    const captureHeight = screenHeight

    console.log(`📸 Capturing at screen logical dimensions: ${captureWidth}x${captureHeight}`)

    // Collect window IDs to exclude
    const excludeIds: number[] = []
    if (mainWindow) {
      excludeIds.push(mainWindow.id)
    }
    if (overlayWindow) {
      excludeIds.push(overlayWindow.id)
    }

    let result: string | null = null

    // On macOS, try native Swift script first (full resolution, better quality)
    // Falls back to desktopCapturer if Swift script fails
    if (process.platform === 'darwin') {
      try {
        // Swift scripts are in the electron/ directory, not dist-electron/
        // In dev: __dirname is dist-electron, so go up one level to electron/
        // In prod: app.getAppPath() gives us the app directory
        const electronDir = process.env.VITE_DEV_SERVER_URL
          ? path.join(__dirname, '../electron')
          : path.join(app.getAppPath(), 'electron')
        const swiftScriptPath = path.join(electronDir, 'capture-screen.swift')
        const args = excludeIds.map(id => id.toString())

        // Execute Swift script - uses CGWindowListCreateImage which works on all macOS versions
        const { stdout } = await execFileAsync('swift', [swiftScriptPath, ...args], {
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large screenshots
        })

        const base64 = stdout.trim()
        if (base64 && base64.length > 0) {
          // Convert to data URL format
          result = `data:image/png;base64,${base64}`
          console.log('📸 Screenshot captured via Swift script (full resolution), size:', base64.length)
        }
      } catch (swiftError: any) {
        console.log('⚠️ Swift capture failed, falling back to desktopCapturer:', swiftError.message)
        // Fallback to desktopCapturer if native method fails
      }

      // Use desktopCapturer if Swift capture wasn't used or failed
      if (!result) {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: captureWidth, height: captureHeight }
        })

        if (sources.length > 0 && sources[0]) {
          const fullScreenshot = sources[0].thumbnail
          if (fullScreenshot) {
            result = fullScreenshot.toDataURL()
            if (result) {
              console.log('📸 Screenshot captured via desktopCapturer (fallback), size:', result.length)
            }
          }
        }
      }
    } else {
      // Non-macOS: use desktopCapturer
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: captureWidth, height: captureHeight }
      })

      if (sources.length > 0 && sources[0]) {
        const fullScreenshot = sources[0].thumbnail
        if (fullScreenshot) {
          result = fullScreenshot.toDataURL()
          if (result) {
            console.log('Screenshot captured, size:', result.length)
          }
        }
      }
    }

    // Measure actual screenshot dimensions and store for coordinate mapping
    if (result) {
      const actualDimensions = getImageDimensions(result)
      if (actualDimensions) {
        // Calculate physical screen dimensions (accounting for Retina scaling)
        const physicalScreenWidth = screenWidth * scaleFactor
        const physicalScreenHeight = screenHeight * scaleFactor

        // Store dimensions for coordinate mapping
        // Since we capture at logical screen size, screenshot coords map 1:1 to screen coords
        lastScreenshotDimensions = {
          width: actualDimensions.width,
          height: actualDimensions.height,
          screenWidth: screenWidth, // Use logical pixels (no scaling needed)
          screenHeight: screenHeight, // Use logical pixels (no scaling needed)
          scaleFactor: scaleFactor
        }

        console.log('📐 Screenshot dimensions measured:', {
          screenshot: `${actualDimensions.width}x${actualDimensions.height}`,
          screenLogical: `${screenWidth}x${screenHeight}`,
          screenPhysical: `${physicalScreenWidth}x${physicalScreenHeight}`,
          scaleFactor: scaleFactor,
          requested: `${captureWidth}x${captureHeight}`,
          scalingNeeded: actualDimensions.width !== screenWidth || actualDimensions.height !== screenHeight
        })
      } else {
        console.warn('⚠️ Could not measure screenshot dimensions, using requested dimensions as fallback')
        // Fallback to requested dimensions if measurement fails
        lastScreenshotDimensions = {
          width: captureWidth,
          height: captureHeight,
          screenWidth: screenWidth, // Use logical pixels
          screenHeight: screenHeight, // Use logical pixels
          scaleFactor: scaleFactor
        }
      }
    }

    return result
  } catch (error) {
    console.error('Screen capture error:', error)
    return null
  } finally {
    captureInProgress = false
  }
})

// Window control handlers
ipcMain.handle('hide-window', () => {
  if (mainWindow) {
    // Close DevTools when hiding the window
    mainWindow.webContents.closeDevTools()
    mainWindow.hide()
  }
})

ipcMain.handle('toggle-window', () => {
  toggleWindow()
})

// Test overlay - manually trigger a highlight for debugging
ipcMain.handle('test-overlay', () => {
  if (overlayWindow) {
    console.log('Testing overlay with manual highlight')
    overlayWindow.show()
    overlayWindow.webContents.send('show-highlight', {
      id: 'test-manual',
      x: 500,
      y: 300,
      width: 100,
      height: 100,
      radius: 50
    })
  }
})

// Overlay handlers
interface HighlightData {
  id: string
  x: number
  y: number
  radius?: number
  coordinateSource?: 'accessibility' | 'ai'
}

// Store screenshot dimensions and screen info for coordinate mapping
interface ScreenshotDimensions {
  width: number
  height: number
  screenWidth: number
  screenHeight: number
  scaleFactor: number
}
let lastScreenshotDimensions: ScreenshotDimensions | null = null

/**
 * Parse actual image dimensions from base64 data URL
 * Returns { width, height } or null if parsing fails
 */
function getImageDimensions(dataUrl: string): { width: number; height: number } | null {
  try {
    const image = nativeImage.createFromDataURL(dataUrl)
    if (image.isEmpty()) {
      console.warn('Failed to parse image dimensions: image is empty')
      return null
    }
    const size = image.getSize()
    return { width: size.width, height: size.height }
  } catch (error) {
    console.error('Error parsing image dimensions:', error)
    return null
  }
}

ipcMain.handle('set-screenshot-dimensions', (_event: any, width: number, height: number) => {
  const primaryDisplay = electronScreen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.size
  const scaleFactor = primaryDisplay.scaleFactor || 1
  lastScreenshotDimensions = {
    width,
    height,
    screenWidth,
    screenHeight,
    scaleFactor
  }
})

ipcMain.handle('show-overlay-highlight', (_event: any, data: HighlightData) => {
  if (!overlayWindow) return

  const primaryDisplay = electronScreen.getPrimaryDisplay()
  const { width: logicalScreenWidth, height: logicalScreenHeight } = primaryDisplay.size

  // Get the last screenshot dimensions for coordinate scaling
  let screenX = data.x
  let screenY = data.y

  // If screenshot dimensions don't match screen logical dimensions, scale coordinates
  if (lastScreenshotDimensions &&
    (lastScreenshotDimensions.width !== logicalScreenWidth ||
      lastScreenshotDimensions.height !== logicalScreenHeight)) {

    const scaleX = logicalScreenWidth / lastScreenshotDimensions.width
    const scaleY = logicalScreenHeight / lastScreenshotDimensions.height

    console.log(`📍 [Main] Scaling coordinates: screenshot=${lastScreenshotDimensions.width}x${lastScreenshotDimensions.height}, screen=${logicalScreenWidth}x${logicalScreenHeight}, scale=${scaleX.toFixed(2)}x${scaleY.toFixed(2)}`)

    screenX = data.x * scaleX
    screenY = data.y * scaleY

    console.log(`📍 [Main] Scaled coordinates: (${data.x}, ${data.y}) → (${screenX.toFixed(1)}, ${screenY.toFixed(1)})`)
  }

  // Round and validate coordinates are within screen bounds (logical pixels)
  screenX = Math.round(screenX)
  screenY = Math.round(screenY)
  screenX = Math.max(0, Math.min(screenX, logicalScreenWidth))
  screenY = Math.max(0, Math.min(screenY, logicalScreenHeight))

  if (data.coordinateSource === 'accessibility') {
    console.log(`📍 [Main] Using Accessibility API coordinates (screen space): (${data.x}, ${data.y})`)
  } else {
    console.log(`📍 [Main] Using AI coordinates (mapped from screenshot): (${data.x}, ${data.y}) → screen: (${screenX}, ${screenY})`)
  }

  // Get overlay window bounds to verify coordinate system
  const overlayBounds = overlayWindow.getBounds()
  console.log(`📍 [Main] Overlay window bounds: x=${overlayBounds.x}, y=${overlayBounds.y}, width=${overlayBounds.width}, height=${overlayBounds.height}`)
  console.log(`📍 [Main] Screen logical size: ${logicalScreenWidth}x${logicalScreenHeight}`)
  console.log(`📍 [Main] Final screen coordinates: (${screenX}, ${screenY})`)

  // Coordinates are in screen space (0,0 = top-left of primary display)
  // Overlay window canvas coordinate system: (0,0) = top-left of canvas
  // If overlay window is positioned at (displayX, displayY), we need to adjust coordinates
  // to be relative to the overlay window's coordinate system
  let canvasX = screenX
  let canvasY = screenY

  // Adjust for overlay window position (if not at 0,0)
  // For primary display, displayX and displayY should be 0, but check anyway
  if (overlayBounds.x !== 0 || overlayBounds.y !== 0) {
    canvasX = screenX - overlayBounds.x
    canvasY = screenY - overlayBounds.y
    console.log(`📍 [Main] Adjusted coordinates for overlay position: (${canvasX}, ${canvasY})`)
  }

  console.log(`📍 [Main] Final coordinates for canvas: (${canvasX}, ${canvasY})`)

  // AI provides center coordinates, overlay handles center coordinates directly
  const highlightData = {
    id: data.id,
    x: canvasX,
    y: canvasY,
    radius: data.radius || FIXED_HIGHLIGHT_RADIUS
  }

  console.log('📍 [Main] Sending highlight to overlay window:', highlightData)
  console.log('📍 [Main] Overlay window exists:', !!overlayWindow)
  console.log('📍 [Main] Overlay window visible:', overlayWindow?.isVisible())

  // Ensure overlay window is visible
  if (!overlayWindow.isVisible()) {
    console.log('Showing overlay window')
    overlayWindow.show()
  }

  // Keep overlay click-through (clicks pass through except where handled in renderer)
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })

  // Wait a bit for window to be ready, then send
  setTimeout(() => {
    overlayWindow.webContents.send('show-highlight', highlightData)
    console.log('Highlight data sent to overlay')
  }, 100)
})

ipcMain.handle('hide-overlay', () => {
  overlayWindow?.hide()
})

ipcMain.handle('clear-overlay-highlights', () => {
  if (overlayWindow && overlayWindow.webContents) {
    overlayWindow.webContents.send('clear-highlights')
  }
})

ipcMain.handle('update-overlay-highlight', (_event: any, data: HighlightData) => {
  if (!overlayWindow) return

  const primaryDisplay = electronScreen.getPrimaryDisplay()
  const { width: logicalScreenWidth, height: logicalScreenHeight } = primaryDisplay.size

  // Get the last screenshot dimensions for coordinate scaling
  let screenX = data.x
  let screenY = data.y

  // If screenshot dimensions don't match screen logical dimensions, scale coordinates
  if (lastScreenshotDimensions &&
    (lastScreenshotDimensions.width !== logicalScreenWidth ||
      lastScreenshotDimensions.height !== logicalScreenHeight)) {

    const scaleX = logicalScreenWidth / lastScreenshotDimensions.width
    const scaleY = logicalScreenHeight / lastScreenshotDimensions.height

    screenX = data.x * scaleX
    screenY = data.y * scaleY
  }

  // Round and validate coordinates are within screen bounds (logical pixels)
  screenX = Math.round(screenX)
  screenY = Math.round(screenY)
  screenX = Math.max(0, Math.min(screenX, logicalScreenWidth))
  screenY = Math.max(0, Math.min(screenY, logicalScreenHeight))

  // Get overlay window bounds and adjust coordinates if needed
  const overlayBounds = overlayWindow.getBounds()
  let canvasX = screenX
  let canvasY = screenY

  if (overlayBounds.x !== 0 || overlayBounds.y !== 0) {
    canvasX = screenX - overlayBounds.x
    canvasY = screenY - overlayBounds.y
  }

  // AI provides center coordinates, overlay handles center coordinates directly
  overlayWindow.webContents.send('update-highlight', {
    id: data.id,
    x: canvasX,
    y: canvasY,
    radius: data.radius || FIXED_HIGHLIGHT_RADIUS
  })
})

// Speech bubble handlers
interface SpeechBubbleData {
  text: string
  x: number
  y: number
  radius: number
}

ipcMain.handle('show-speech-bubble', (_event: any, data: SpeechBubbleData) => {
  if (!overlayWindow) return

  const primaryDisplay = electronScreen.getPrimaryDisplay()
  const { width: logicalScreenWidth, height: logicalScreenHeight } = primaryDisplay.size

  // Get the last screenshot dimensions for coordinate scaling
  let screenX = data.x
  let screenY = data.y

  // If screenshot dimensions don't match screen logical dimensions, scale coordinates
  if (lastScreenshotDimensions &&
    (lastScreenshotDimensions.width !== logicalScreenWidth ||
      lastScreenshotDimensions.height !== logicalScreenHeight)) {

    const scaleX = logicalScreenWidth / lastScreenshotDimensions.width
    const scaleY = logicalScreenHeight / lastScreenshotDimensions.height

    screenX = data.x * scaleX
    screenY = data.y * scaleY
  }

  // Validate coordinates
  screenX = Math.round(screenX)
  screenY = Math.round(screenY)
  screenX = Math.max(0, Math.min(screenX, logicalScreenWidth))
  screenY = Math.max(0, Math.min(screenY, logicalScreenHeight))

  // Get overlay window bounds and adjust coordinates if needed
  const overlayBounds = overlayWindow.getBounds()
  let canvasX = screenX
  let canvasY = screenY

  if (overlayBounds.x !== 0 || overlayBounds.y !== 0) {
    canvasX = screenX - overlayBounds.x
    canvasY = screenY - overlayBounds.y
  }

  // Ensure overlay window is visible
  if (!overlayWindow.isVisible()) {
    overlayWindow.show()
  }

  // Keep overlay click-through (clicks pass through to underlying applications)
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })

  // Send speech bubble data to overlay
  setTimeout(() => {
    overlayWindow.webContents.send('speech-bubble', {
      text: data.text,
      x: canvasX,
      y: canvasY,
      radius: data.radius || FIXED_HIGHLIGHT_RADIUS
    })
  }, 100)
})

ipcMain.handle('dismiss-speech-bubble', () => {
  // Show the main window when speech bubble is dismissed
  if (mainWindow && !mainWindow.isVisible()) {
    const primaryDisplay = electronScreen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
    const x = Math.floor((screenWidth - WINDOW_WIDTH) / 2)
    const y = Math.floor((screenHeight - WINDOW_MAX_HEIGHT) / 2)

    mainWindow.setPosition(x, y)
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('window-shown')
  }

  // Clear speech bubble from overlay
  if (overlayWindow && overlayWindow.webContents) {
    overlayWindow.webContents.send('dismiss-speech-bubble')
  }

  // Keep overlay click-through (clicks pass through to underlying applications)
  if (overlayWindow) {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  }
})

// Loading indicator handlers
ipcMain.handle('show-loading-indicator', () => {
  if (!overlayWindow) return

  // Ensure overlay window is visible
  if (!overlayWindow.isVisible()) {
    overlayWindow.show()
  }

  // Keep overlay click-through
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })

  // Send loading indicator to overlay
  if (overlayWindow.webContents) {
    overlayWindow.webContents.send('show-loading')
  }
})

ipcMain.handle('hide-loading-indicator', () => {
  if (overlayWindow && overlayWindow.webContents) {
    overlayWindow.webContents.send('hide-loading')
  }
})

// Find element using macOS Accessibility API
interface FindElementData {
  text: string
  type?: string
  context?: string
}

ipcMain.handle('find-element-accessibility', async (_event: any, data: FindElementData): Promise<{ x: number, y: number, width: number, height: number } | null> => {
  // Only works on macOS
  if (process.platform !== 'darwin') {
    console.log('Accessibility API only available on macOS')
    return null
  }

  // Extract target app name from context or target text
  // For menu bar items, the target text often matches the app name
  let targetAppName: string | undefined = undefined

  // If context indicates menu bar, try to infer app name from target text
  const isMenuBarSearch = data.context?.toLowerCase().includes('menu bar') || data.context?.toLowerCase().includes('menubar')

  if (isMenuBarSearch && data.text) {
    // For menu bar items, the target text is often the app name
    // Common patterns: "Cursor", "File", "Edit", etc.
    // If it's a common menu name, we might need to search differently
    // But if it's a capitalized single word that could be an app name, use it
    const commonMenuNames = ['file', 'edit', 'view', 'window', 'help', 'about', 'preferences', 'settings', 'quit', 'close']
    const normalizedText = data.text.toLowerCase().trim()

    // If it's not a common menu name, assume it's the app name
    if (!commonMenuNames.includes(normalizedText)) {
      targetAppName = data.text.trim()
      console.log('🔍 [Accessibility API] Inferred app name from menu bar target:', targetAppName)
    }
  }

  // If we still don't have an app name but have context, try to extract from context
  if (!targetAppName && data.context) {
    // Look for app name patterns in context like "in Cursor" or "Cursor app"
    const appNameMatch = data.context.match(/\b([A-Z][a-zA-Z]+)\b/)
    if (appNameMatch) {
      const potentialAppName = appNameMatch[1]
      // Exclude common words
      const excludedWords = ['the', 'top', 'menu', 'bar', 'application', 'app', 'window', 'dialog']
      if (!excludedWords.includes(potentialAppName.toLowerCase())) {
        targetAppName = potentialAppName
        console.log('🔍 [Accessibility API] Extracted app name from context:', targetAppName)
      }
    }
  }

  try {
    // Swift scripts are in the electron/ directory, not dist-electron/
    // In dev: __dirname is dist-electron, so go up one level to electron/
    // In prod: app.getAppPath() gives us the app directory
    const electronDir = process.env.VITE_DEV_SERVER_URL
      ? path.join(__dirname, '../electron')
      : path.join(app.getAppPath(), 'electron')
    const swiftScriptPath = path.join(electronDir, 'find-element.swift')

    // Build arguments: text, type (optional), context (optional), appName (optional)
    const args: string[] = [swiftScriptPath, data.text]
    if (data.type) {
      args.push(data.type)
    }
    if (data.context) {
      args.push(data.context)
    }
    if (targetAppName) {
      args.push(targetAppName)
    }

    console.log('🔍 [Accessibility API] Executing lookup for:', data.text, data.type ? `(type: ${data.type})` : '', data.context ? `(context: ${data.context})` : '', targetAppName ? `(app: ${targetAppName})` : '')
    console.log('🔍 [Accessibility API] Full Swift script args:', args)
    console.log('🔍 [Accessibility API] Swift script path:', swiftScriptPath)

    // Execute Swift script with timeout
    try {
      console.log('🔍 [Accessibility API] Executing Swift script with args:', args.slice(1)) // Skip script path
      const { stdout, stderr } = await execFileAsync('swift', args, {
        maxBuffer: 1024 * 1024, // 1MB buffer
        timeout: 5000 // 5 second timeout
      })

      // Always log stderr for debugging (Swift script writes debug info there)
      if (stderr && stderr.trim()) {
        console.log('🔍 [Accessibility API] Swift script debug output:')
        console.log(stderr)
      } else {
        console.log('🔍 [Accessibility API] No stderr output from Swift script')
      }

      const output = stdout.trim()

      // Check for error messages
      if (output.startsWith('ERROR:')) {
        console.log('🔍 [Accessibility API] Swift script error:', output)
        if (stderr && stderr.trim()) {
          console.log('🔍 [Accessibility API] Additional debug info:', stderr)
        }
        return null
      }

      // Parse JSON response
      try {
        const result = JSON.parse(output)
        if (result.x !== undefined && result.y !== undefined) {
          console.log('🔍 [Accessibility API] Success: Found element at:', result)
          return {
            x: result.x,
            y: result.y,
            width: result.width || 40,
            height: result.height || 40
          }
        } else {
          console.log('🔍 [Accessibility API] Invalid response format - missing coordinates:', result)
          return null
        }
      } catch (parseError) {
        console.error('🔍 [Accessibility API] Failed to parse JSON response:', parseError)
        console.error('🔍 [Accessibility API] Raw output:', output)
        if (stderr && stderr.trim()) {
          console.error('🔍 [Accessibility API] stderr:', stderr)
        }
        return null
      }
    } catch (execError: any) {
      // execFileAsync throws when script exits with non-zero code
      // Try to extract stderr from the error if available
      const errorMessage = execError.message || 'Unknown error'

      console.log('🔍 [Accessibility API] Swift script execution failed:', errorMessage)
      console.log('🔍 [Accessibility API] Error details:', {
        code: execError.code,
        signal: execError.signal,
        hasStdout: !!execError.stdout,
        hasStderr: !!execError.stderr
      })

      // Check if stdout contains error message (Swift script prints errors to stdout)
      if (execError.stdout && execError.stdout.trim()) {
        const stdoutOutput = execError.stdout.trim()
        console.log('🔍 [Accessibility API] Script stdout:')
        console.log(stdoutOutput)
        if (stdoutOutput.startsWith('ERROR:')) {
          console.log('🔍 [Accessibility API] Error from script:', stdoutOutput)
        }
      }

      // Log stderr for debugging - this is where Swift script writes debug info
      if (execError.stderr && execError.stderr.trim()) {
        console.log('🔍 [Accessibility API] Script stderr (debug output):')
        console.log(execError.stderr)
      } else {
        console.log('🔍 [Accessibility API] No stderr available in error object')
      }

      // Also try to get stderr from the error message itself
      const errorStderr = execError.stderr || ''

      // If we have stdout that might be JSON, try to parse it
      if (execError.stdout && !execError.stdout.trim().startsWith('ERROR:')) {
        try {
          const result = JSON.parse(execError.stdout.trim())
          if (result.x !== undefined && result.y !== undefined) {
            console.log('🔍 [Accessibility API] Found element despite error:', result)
            return {
              x: result.x,
              y: result.y,
              width: result.width || 40,
              height: result.height || 40
            }
          }
        } catch {
          // Not JSON, ignore
        }
      }

      return null
    }
  } catch (error: any) {
    // Handle unexpected errors
    console.error('🔍 [Accessibility API] Unexpected error:', error.message)
    console.error('🔍 [Accessibility API] Error stack:', error.stack)
    return null
  }

  return null
})

// Call Homerow's search function
// Activates Homerow and searches for the given text
ipcMain.handle('call-homerow-search', async (_event: any, searchText: string): Promise<boolean> => {
  if (process.platform !== 'darwin') {
    console.log('Homerow search only available on macOS')
    return false
  }

  if (!searchText || !searchText.trim()) {
    console.log('🔍 [Homerow] No search text provided for Homerow')
    return false
  }

  // The searchText is the button/element name (e.g., "call", "save", "submit")
  console.log('🔍 [Homerow] Button name to search for:', searchText)

  try {
    // Use AppleScript to:
    // 1. Focus the current window
    // 2. Activate Homerow with Shift+Control+Option+Command+F
    // 3. Type the button name into Homerow search
    // Escape special characters for AppleScript
    // Also escape single quotes which might cause issues
    const escapedText = searchText
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/'/g, "\\'")
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`')

    console.log('🔍 [Homerow] Original button name:', searchText)
    console.log('🔍 [Homerow] Escaped text for AppleScript:', escapedText)
    console.log('🔍 [Homerow] Text length:', searchText.length)

    const appleScript = `
      tell application "System Events"
        -- Get the frontmost application and window
        set frontApp to first application process whose frontmost is true
        set frontWindow to first window of frontApp
        
        -- Activate the frontmost application to ensure it's in foreground
        tell frontApp
          set frontmost to true
        end tell
        delay 0.4 -- Wait for app to become frontmost and fully activate
        
        -- Click on the window to ensure it's focused and receives keyboard events
        if frontWindow exists then
          try
            click frontWindow
            delay 0.4 -- Wait for window to receive focus and be ready for keyboard input
          on error
            -- If click fails, try to activate the window differently
            tell frontApp
              perform action "AXRaise" of frontWindow
            end tell
            delay 0.4
          end try
        end if
        
        -- Activate Homerow with keyboard shortcut (Shift+Control+Option+Command+F)
        -- Key code 3 is F key
        -- Send the key combination - this should trigger Homerow
        key code 3 using {command down, shift down, control down, option down}
        delay 1.5 -- Wait longer for Homerow to fully activate and open its search interface
        
        -- Find and set the value of the Homerow search field directly
        -- This is more reliable than using keystroke
        try
          -- Try to find Homerow application
          set homerowApp to first application process whose name contains "Homerow"
          if homerowApp exists then
            -- Get the Homerow window
            set homerowWindow to first window of homerowApp
            if homerowWindow exists then
              -- Look for a text field in the Homerow window (the search field)
              set searchField to first text field of homerowWindow
              if searchField exists then
                -- Set the value directly - this is more reliable than keystroke
                set value of searchField to "${escapedText}"
                delay 0.1
              else
                -- If we can't find a text field, fall back to keystroke
                click homerowWindow
                delay 0.3
                -- Clear the field first
                keystroke "a" using command down
                delay 0.1
                keystroke (ASCII character 127)
                delay 0.2
                -- Type the button name
                keystroke "${escapedText}"
              end if
            else
              -- Fallback: use keystroke if we can't find the window
              delay 0.5
              keystroke "a" using command down
              delay 0.1
              keystroke (ASCII character 127)
              delay 0.2
              keystroke "${escapedText}"
            end if
          else
            -- Fallback: use keystroke if we can't find Homerow app
            delay 0.5
            keystroke "a" using command down
            delay 0.1
            keystroke (ASCII character 127)
            delay 0.2
            keystroke "${escapedText}"
          end if
        on error
          -- Final fallback: use keystroke
          delay 0.5
          keystroke "a" using command down
          delay 0.1
          keystroke (ASCII character 127)
          delay 0.2
          keystroke "${escapedText}"
        end try
      end tell
    `

    console.log('🔍 [Homerow] Calling Homerow search for:', searchText)
    console.log('🔍 [Homerow] Executing AppleScript to activate Homerow...')

    try {
      const { stdout, stderr } = await execFileAsync('osascript', ['-e', appleScript], {
        timeout: 10000 // Increased timeout to 10 seconds
      })

      if (stderr && stderr.trim()) {
        console.log('🔍 [Homerow] AppleScript stderr:', stderr)
      }

      if (stdout && stdout.trim()) {
        console.log('🔍 [Homerow] AppleScript stdout:', stdout)
      }

      console.log('🔍 [Homerow] Homerow search activated successfully')
      return true
    } catch (execError: any) {
      console.error('🔍 [Homerow] AppleScript execution error:', execError.message)
      if (execError.stdout) {
        console.log('🔍 [Homerow] Error stdout:', execError.stdout)
      }
      if (execError.stderr) {
        console.log('🔍 [Homerow] Error stderr:', execError.stderr)
      }
      return false
    }
  } catch (error: any) {
    console.error('🔍 [Homerow] Error calling Homerow search:', error.message)
    return false
  }
})

// IPC handlers for click monitoring
ipcMain.handle('start-click-monitoring', () => {
  return startClickMonitoring()
})

ipcMain.handle('stop-click-monitoring', () => {
  stopClickMonitoring()
  return true
})

// Trigger guidance check (send to renderer)
function triggerGuidanceCheck() {
  if (mainWindow && mainWindow.webContents) {
    console.log('Hotkey triggered: checking screen for guidance')
    mainWindow.webContents.send('trigger-guidance-check')
    // Also show the window if hidden
    if (!mainWindow.isVisible()) {
      toggleWindow()
    }
  }
}

// Start monitoring mouse clicks
function startClickMonitoring() {
  // Only works on macOS
  if (process.platform !== 'darwin') {
    console.log('Click monitoring only available on macOS')
    return false
  }

  // Stop existing monitor if running
  stopClickMonitoring()

  try {
    const electronDir = process.env.VITE_DEV_SERVER_URL
      ? path.join(__dirname, '../electron')
      : path.join(app.getAppPath(), 'electron')
    const swiftScriptPath = path.join(electronDir, 'monitor-clicks.swift')

    console.log('Starting click monitoring:', swiftScriptPath)

    // Spawn Swift script as a long-running process
    clickMonitorProcess = spawn('swift', [swiftScriptPath], {
      cwd: electronDir
    })

    let buffer = ''

    // Handle stdout - read JSON events line by line
    clickMonitorProcess.stdout.on('data', (data: Buffer) => {
      const rawData = data.toString()
      console.log('[Main] Swift script output (raw):', rawData)
      buffer += rawData
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue

        console.log('[Main] Processing line from Swift:', line)
        try {
          const event = JSON.parse(line)
          console.log('[Main] Parsed event:', event)

          if (event.status === 'started') {
            console.log('[Main] Click monitoring started')
            // Notify renderer that monitoring started
            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send('click-monitoring-started')
            }
          } else if (event.type === 'click') {
            // Forward click event to renderer
            console.log('[Main] Click event received from Swift:', event)
            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send('mouse-click', event)
              console.log('[Main] Click event sent to renderer')
            } else {
              console.warn('[Main] Cannot send click event: mainWindow or webContents not available')
            }
          } else {
            console.log('[Main] Unknown event type:', event)
          }
        } catch (parseError) {
          // Ignore parse errors for non-JSON lines
          if (line.trim() && !line.trim().startsWith('ERROR:')) {
            console.log('[Main] Click monitor output (non-JSON):', line)
          }
        }
      }
    })

    // Handle stderr
    clickMonitorProcess.stderr.on('data', (data: Buffer) => {
      const error = data.toString()
      console.log('[Main] Swift script stderr:', error)
      if (error.includes('ERROR:') || error.includes('Accessibility')) {
        console.error('[Main] Click monitor error:', error)
        // Notify renderer of error
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('click-monitoring-error', error)
        }
      } else {
        console.log('[Main] Click monitor stderr (non-error):', error)
      }
    })

    // Handle process exit
    clickMonitorProcess.on('exit', (code: number, signal: string) => {
      console.log(`Click monitor exited: code=${code}, signal=${signal}`)
      clickMonitorProcess = null
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('click-monitoring-stopped')
      }
    })

    return true
  } catch (error: any) {
    console.error('Failed to start click monitoring:', error)
    clickMonitorProcess = null
    return false
  }
}

// Stop monitoring mouse clicks
function stopClickMonitoring() {
  if (clickMonitorProcess) {
    console.log('Stopping click monitoring')
    clickMonitorProcess.kill('SIGTERM')
    clickMonitorProcess = null
  }
}

function createTray() {
  // Create a simple menu bar icon
  // Using a template image for macOS (will be white/black based on menu bar color)
  const iconPath = path.join(__dirname, '../assets/tray-icon.png')
  const fs = require('fs')

  // Try to load icon from file, fallback to creating a simple one
  let trayIcon
  if (fs.existsSync(iconPath)) {
    try {
      trayIcon = nativeImage.createFromPath(iconPath)
      if (trayIcon.isEmpty()) {
        throw new Error('Icon file is empty')
      }
    } catch (e) {
      console.log('Failed to load tray icon from file, creating programmatically')
      trayIcon = null
    }
  }

  // If icon is empty or file doesn't exist, create a simple template image
  if (!trayIcon || trayIcon.isEmpty()) {
    // Create a simple 16x16 icon using Canvas API or fallback to a simple colored square
    // For macOS, we want a template image that adapts to menu bar color
    const iconSvg = Buffer.from(`
      <svg width="16" height="16" xmlns="http://www.w3.org/2000/svg">
        <rect width="16" height="16" fill="white" opacity="0.01"/>
        <circle cx="8" cy="8" r="5" fill="white" opacity="0.9"/>
        <path d="M8 3 L8 13 M3 8 L13 8" stroke="black" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
    `)
    trayIcon = nativeImage.createFromBuffer(iconSvg)
  }

  trayIcon.setTemplateImage(true) // Makes it adapt to menu bar color on macOS

  tray = new Tray(trayIcon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show SigmaGuide',
      click: () => {
        toggleWindow()
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setToolTip('SigmaGuide - AI Screen Assistant')
  tray.setContextMenu(contextMenu)

  // Click tray icon to toggle window
  tray.on('click', () => {
    toggleWindow()
  })
}

app.whenReady().then(() => {
  createWindow()
  createOverlayWindow()
  createTray()

  // Register global shortcut: Cmd+Shift+Space to toggle window (Raycast-style)
  const toggleShortcut = process.platform === 'darwin' ? 'Command+Shift+Space' : 'Control+Shift+Space'
  const registered = globalShortcut.register(toggleShortcut, toggleWindow)

  if (registered) {
    console.log(`Registered shortcut: ${toggleShortcut} (toggle window)`)
  } else {
    console.error(`Failed to register shortcut: ${toggleShortcut}`)
  }

  // Register global shortcut: Cmd+Shift+G to trigger guidance check (alternative)
  const checkShortcut = process.platform === 'darwin' ? 'Command+Shift+G' : 'Control+Shift+G'
  const checkRegistered = globalShortcut.register(checkShortcut, triggerGuidanceCheck)

  if (checkRegistered) {
    console.log(`Registered shortcut: ${checkShortcut} (trigger guidance check)`)
  }

  // Register global shortcut: Cmd+Option+I to toggle DevTools
  const devToolsShortcut = process.platform === 'darwin' ? 'Command+Option+I' : 'Control+Shift+I'
  const devToolsRegistered = globalShortcut.register(devToolsShortcut, toggleDevTools)

  if (devToolsRegistered) {
    console.log(`Registered shortcut: ${devToolsShortcut} (toggle DevTools)`)
  } else {
    console.log(`Failed to register DevTools shortcut: ${devToolsShortcut}`)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      toggleWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed (menu bar app)
  // Don't quit - the tray icon keeps it alive
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopClickMonitoring()
})
