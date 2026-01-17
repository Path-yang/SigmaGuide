export interface ElectronAPI {
  captureScreen: () => Promise<string | null>
  minimizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  toggleWindow: () => Promise<void>
  onTriggerGuidanceCheck: (callback: () => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}






