export type WindowMode = 'sidebar' | 'overlay'
export type GuidanceMode = 'steps' | 'single'

export interface ElectronAPI {
  captureScreen: () => Promise<string | null>
  minimizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  toggleWindow: () => Promise<void>
  // Window mode
  setWindowMode: (mode: WindowMode) => Promise<void>
  onWindowModeChanged: (callback: (mode: WindowMode) => void) => () => void
  // Guidance check
  onTriggerGuidanceCheck: (callback: () => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}






