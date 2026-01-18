import { useEffect, useRef } from 'react'
import { ChatSidebar } from './components/ChatSidebar'
import { MessageInput } from './components/MessageInput'
import { reactiveOrchestrator } from './agents/reactiveOrchestrator'
import './types/electron.d.ts'

function App() {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Note: Click monitoring is started when user sends a message, not on app load

  // Handle Escape key to close window
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.electronAPI?.hideWindow()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Auto-focus input when window is shown
  useEffect(() => {
    const cleanup = window.electronAPI?.onWindowShown(() => {
      // Small delay to ensure input is rendered
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    })

    return cleanup
  }, [])

  // Also focus on mount if window is visible
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus()
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="w-full h-full overflow-hidden bg-transparent">
      {/* Raycast-style container with backdrop blur */}
      <div className="w-full h-full bg-sigma-900/80 backdrop-blur-2xl rounded-2xl border border-sigma-700/30 shadow-2xl overflow-hidden flex flex-col">
        <ChatSidebar inputRef={inputRef} />
      </div>
    </div>
  )
}

export default App






