const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  toggleWindow: () => ipcRenderer.invoke('toggle-window'),
  // Window mode switching
  setWindowMode: (mode: 'sidebar' | 'overlay') => ipcRenderer.invoke('set-window-mode', mode),
  onWindowModeChanged: (callback: (mode: 'sidebar' | 'overlay') => void) => {
    ipcRenderer.on('window-mode-changed', (_event: any, mode: 'sidebar' | 'overlay') => callback(mode))
    return () => ipcRenderer.removeListener('window-mode-changed', callback)
  },
  // Listen for hotkey-triggered guidance check
  onTriggerGuidanceCheck: (callback: () => void) => {
    ipcRenderer.on('trigger-guidance-check', callback)
    // Return cleanup function
    return () => ipcRenderer.removeListener('trigger-guidance-check', callback)
  },
})
