export type GuidanceMode = 'steps' | 'single'

export interface HighlightData {
  id: string
  x: number
  y: number
  radius?: number
  coordinateSource?: 'accessibility' | 'ai'
}

export interface ElectronAPI {
  captureScreen: () => Promise<string | null>
  hideWindow: () => Promise<void>
  toggleWindow: () => Promise<void>
  // Window visibility
  onWindowShown: (callback: () => void) => () => void
  // Guidance check
  onTriggerGuidanceCheck: (callback: () => void) => () => void
  // Click monitoring
  startClickMonitoring: () => Promise<boolean>
  stopClickMonitoring: () => Promise<boolean>
  onMouseClick: (callback: (event: { type: string; button: string; x: number; y: number; timestamp: number }) => void) => () => void
  onClickMonitoringStarted: (callback: () => void) => () => void
  onClickMonitoringStopped: (callback: () => void) => () => void
  onClickMonitoringError: (callback: (error: string) => void) => () => void
  // Overlay methods
  showOverlayHighlight: (data: HighlightData) => Promise<void>
  hideOverlay: () => Promise<void>
  clearOverlayHighlights: () => Promise<void>
  updateOverlayHighlight: (data: HighlightData) => Promise<void>
  // Speech bubble methods
  showSpeechBubble: (data: { text: string; x: number; y: number; radius?: number }) => Promise<void>
  dismissSpeechBubble: () => Promise<void>
  // Loading indicator methods
  showLoadingIndicator: () => Promise<void>
  hideLoadingIndicator: () => Promise<void>
  onShowLoading?: (callback: () => void) => () => void
  onHideLoading?: (callback: () => void) => () => void
  // Overlay event listeners (for overlay window renderer)
  onShowHighlight?: (callback: (data: any) => void) => () => void
  onUpdateHighlight?: (callback: (data: any) => void) => () => void
  onClearHighlights?: (callback: () => void) => () => void
  onSpeechBubble?: (callback: (data: any) => void) => () => void
  onDismissSpeechBubble?: (callback: () => void) => () => void
  // Accessibility API method
  findElementAccessibility: (data: { text: string; type?: string; context?: string }) => Promise<{ x: number, y: number, width: number, height: number } | null>
  // Homerow search method
  callHomerowSearch: (searchText: string) => Promise<boolean>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}






