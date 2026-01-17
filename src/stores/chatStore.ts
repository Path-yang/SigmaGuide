import { create } from 'zustand'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  screenshot?: string
}

interface ChatState {
  messages: Message[]
  isLoading: boolean
  currentScreenshot: string | null
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void
  setLoading: (loading: boolean) => void
  setScreenshot: (screenshot: string | null) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isLoading: false,
  currentScreenshot: null,

  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        },
      ],
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  setScreenshot: (screenshot) => set({ currentScreenshot: screenshot }),

  clearMessages: () => set({ messages: [] }),
}))






