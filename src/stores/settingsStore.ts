import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type WindowMode = 'sidebar' | 'overlay'
export type GuidanceMode = 'steps' | 'single'

interface SettingsState {
  windowMode: WindowMode
  guidanceMode: GuidanceMode
  setWindowMode: (mode: WindowMode) => void
  setGuidanceMode: (mode: GuidanceMode) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      windowMode: 'sidebar',
      guidanceMode: 'steps',

      setWindowMode: (mode) => {
        set({ windowMode: mode })
        // Notify electron to change window mode
        if (typeof window !== 'undefined' && window.electronAPI?.setWindowMode) {
          window.electronAPI.setWindowMode(mode)
        }
      },

      setGuidanceMode: (mode) => set({ guidanceMode: mode }),
    }),
    {
      name: 'sigmaguide-settings',
    }
  )
)

