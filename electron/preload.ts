const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  toggleWindow: () => ipcRenderer.invoke('toggle-window'),
  // Listen for window shown event (to auto-focus input)
  onWindowShown: (callback: () => void) => {
    ipcRenderer.on('window-shown', callback)
    return () => ipcRenderer.removeListener('window-shown', callback)
  },
  // Listen for hotkey-triggered guidance check
  onTriggerGuidanceCheck: (callback: () => void) => {
    ipcRenderer.on('trigger-guidance-check', callback)
    // Return cleanup function
    return () => ipcRenderer.removeListener('trigger-guidance-check', callback)
  },
  // Click monitoring
  startClickMonitoring: () => ipcRenderer.invoke('start-click-monitoring'),
  stopClickMonitoring: () => ipcRenderer.invoke('stop-click-monitoring'),
  onMouseClick: (callback: (event: { type: string; button: string; x: number; y: number; timestamp: number }) => void) => {
    ipcRenderer.on('mouse-click', (_event, data) => {
      console.log('[Preload] Mouse click event received:', data)
      callback(data)
    })
    return () => ipcRenderer.removeListener('mouse-click', callback)
  },
  onClickMonitoringStarted: (callback: () => void) => {
    ipcRenderer.on('click-monitoring-started', callback)
    return () => ipcRenderer.removeListener('click-monitoring-started', callback)
  },
  onClickMonitoringStopped: (callback: () => void) => {
    ipcRenderer.on('click-monitoring-stopped', callback)
    return () => ipcRenderer.removeListener('click-monitoring-stopped', callback)
  },
  onClickMonitoringError: (callback: (error: string) => void) => {
    ipcRenderer.on('click-monitoring-error', (_event, error) => callback(error))
    return () => ipcRenderer.removeListener('click-monitoring-error', callback)
  },
  // Overlay IPC methods
  showOverlayHighlight: (data: { id: string; x: number; y: number; radius?: number }) =>
    ipcRenderer.invoke('show-overlay-highlight', data),
  hideOverlay: () => ipcRenderer.invoke('hide-overlay'),
  clearOverlayHighlights: () => ipcRenderer.invoke('clear-overlay-highlights'),
  updateOverlayHighlight: (data: { id: string; x: number; y: number; radius?: number }) =>
    ipcRenderer.invoke('update-overlay-highlight', data),
  // Speech bubble methods
  showSpeechBubble: (data: { text: string; x: number; y: number; radius?: number }) =>
    ipcRenderer.invoke('show-speech-bubble', data),
  dismissSpeechBubble: () => ipcRenderer.invoke('dismiss-speech-bubble'),
  // Overlay event listeners (for overlay window)
  onShowHighlight: (callback: (data: any) => void) => {
    ipcRenderer.on('show-highlight', (_event, data) => callback(data))
    return () => ipcRenderer.removeListener('show-highlight', callback)
  },
  onUpdateHighlight: (callback: (data: any) => void) => {
    ipcRenderer.on('update-highlight', (_event, data) => callback(data))
    return () => ipcRenderer.removeListener('update-highlight', callback)
  },
  onClearHighlights: (callback: () => void) => {
    ipcRenderer.on('clear-highlights', callback)
    return () => ipcRenderer.removeListener('clear-highlights', callback)
  },
  onSpeechBubble: (callback: (data: any) => void) => {
    ipcRenderer.on('speech-bubble', (_event, data) => callback(data))
    return () => ipcRenderer.removeListener('speech-bubble', callback)
  },
  onDismissSpeechBubble: (callback: () => void) => {
    ipcRenderer.on('dismiss-speech-bubble', callback)
    return () => ipcRenderer.removeListener('dismiss-speech-bubble', callback)
  },
  // Loading indicator methods
  showLoadingIndicator: () => ipcRenderer.invoke('show-loading-indicator'),
  hideLoadingIndicator: () => ipcRenderer.invoke('hide-loading-indicator'),
  onShowLoading: (callback: () => void) => {
    ipcRenderer.on('show-loading', callback)
    return () => ipcRenderer.removeListener('show-loading', callback)
  },
  onHideLoading: (callback: () => void) => {
    ipcRenderer.on('hide-loading', callback)
    return () => ipcRenderer.removeListener('hide-loading', callback)
  },
  // Accessibility API method
  findElementAccessibility: (data: { text: string; type?: string; context?: string }) =>
    ipcRenderer.invoke('find-element-accessibility', data),
})
