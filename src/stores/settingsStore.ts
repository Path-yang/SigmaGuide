import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type GuidanceMode = 'steps' | 'single'

interface SettingsState {
  guidanceMode: GuidanceMode
  setGuidanceMode: (mode: GuidanceMode) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      guidanceMode: 'steps',

      setGuidanceMode: (mode) => set({ guidanceMode: mode }),
    }),
    {
      name: 'sigmaguide-settings',
    }
  )
)

