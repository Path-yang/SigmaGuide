import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '../stores/chatStore'
import { reactiveOrchestrator } from '../agents/reactiveOrchestrator'

export function MessageInput() {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { addMessage, isLoading } = useChatStore()
  const currentGoal = reactiveOrchestrator.getCurrentGoal()

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
    }
  }, [input])

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')

    // Add user message to chat
    addMessage({
      role: 'user',
      content: userMessage,
    })

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
    }
  }

  return (
    <div className="p-4 bg-gradient-to-t from-sigma-900 to-transparent">
      {/* Goal indicator */}
      {currentGoal && (
        <div className="mb-3 flex justify-center">
          <span className="text-xs text-sigma-accent font-mono">
            🎯 Goal: {currentGoal.length > 40 ? currentGoal.substring(0, 40) + '...' : currentGoal}
          </span>
        </div>
      )}

      {/* Input area */}
      <div className="relative bg-sigma-800/80 rounded-2xl border border-sigma-700/50 focus-within:border-sigma-accent/50 focus-within:shadow-lg focus-within:shadow-sigma-accent/10 transition-all duration-200">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={currentGoal ? "Say 'done' or ask a follow-up..." : "What do you need help with?"}
          disabled={isLoading}
          rows={1}
          className="w-full bg-transparent text-gray-100 placeholder-sigma-500 text-sm px-4 py-3 pr-12 resize-none focus:outline-none font-sans leading-relaxed"
          style={{ minHeight: '44px', maxHeight: '120px' }}
        />
        
        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          className={`absolute right-2 bottom-2 p-2 rounded-xl transition-all duration-200 ${
            input.trim() && !isLoading
              ? 'bg-sigma-accent text-white hover:bg-blue-600 shadow-lg shadow-sigma-accent/25'
              : 'bg-sigma-700/50 text-sigma-500 cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>

      {/* Hint text */}
      <p className="text-[10px] text-sigma-500 text-center mt-2 font-mono">
        {currentGoal ? (
          <>Press <kbd className="px-1 py-0.5 bg-sigma-accent/30 text-sigma-accent rounded text-[9px]">Ctrl+Shift+Space</kbd> after each action for next step</>
        ) : (
          <>Press <kbd className="px-1 py-0.5 bg-sigma-800/50 rounded text-[9px]">Enter</kbd> to send</>
        )}
      </p>
    </div>
  )
}






