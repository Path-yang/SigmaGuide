import { useState, useRef, useEffect, RefObject } from 'react'
import { useChatStore } from '../stores/chatStore'
import { reactiveOrchestrator } from '../agents/reactiveOrchestrator'

interface MessageInputProps {
  inputRef?: RefObject<HTMLTextAreaElement>
}

export function MessageInput({ inputRef: externalRef }: MessageInputProps) {
  const [input, setInput] = useState('')
  const internalRef = useRef<HTMLTextAreaElement>(null)
  const textareaRef = externalRef || internalRef
  const { addMessage, isLoading } = useChatStore()
  const currentGoal = reactiveOrchestrator.getCurrentGoal()

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 100)}px`
    }
  }, [input, textareaRef])

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')

    // Add user message to chat
    addMessage({
      role: 'user',
      content: userMessage,
    })

    // Hide chat window immediately when user sends a prompt
    window.electronAPI?.hideWindow()

    // Show loading indicator on overlay
    window.electronAPI?.showLoadingIndicator?.()

    // Process with reactive orchestrator
    const response = await reactiveOrchestrator.processUserMessage(userMessage)

    // Add assistant response
    addMessage({
      role: 'assistant',
      content: response,
      screenshot: useChatStore.getState().currentScreenshot || undefined,
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      window.electronAPI?.hideWindow()
    }
  }

  return (
    <div className="px-5 py-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      {/* Search-first input - prominent, command palette style */}
      <div className="relative">
        {/* Search icon */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg className="w-5 h-5 text-sigma-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={currentGoal ? "Say 'done' or ask a follow-up..." : "Ask anything about your screen..."}
          disabled={isLoading}
          rows={1}
          className="w-full bg-sigma-800/60 rounded-xl border border-sigma-700/40 focus-within:border-sigma-accent/60 focus-within:bg-sigma-800/80 text-gray-100 placeholder-sigma-500 text-base px-12 py-3.5 pr-12 resize-none focus:outline-none font-sans leading-relaxed transition-all duration-200"
          style={{ minHeight: '52px', maxHeight: '100px' }}
        />
        
        {/* Send button - compact */}
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all duration-200 ${
            input.trim() && !isLoading
              ? 'bg-sigma-accent text-white hover:bg-blue-600 shadow-md shadow-sigma-accent/20'
              : 'bg-sigma-700/30 text-sigma-500 cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          )}
        </button>
      </div>

      {/* Hint text - compact */}
      <p className="text-[10px] text-sigma-500 mt-2 font-mono">
        {currentGoal ? (
          <>Press <kbd className="px-1 py-0.5 bg-sigma-accent/20 text-sigma-accent rounded text-[9px]">⌘⇧Space</kbd> after each action</>
        ) : (
          <>Press <kbd className="px-1 py-0.5 bg-sigma-800/50 rounded text-[9px]">Enter</kbd> to send, <kbd className="px-1 py-0.5 bg-sigma-800/50 rounded text-[9px]">Esc</kbd> to close</>
        )}
      </p>
    </div>
  )
}






