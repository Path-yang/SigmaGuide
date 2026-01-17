import { useEffect, useRef, useState } from 'react'
import { useChatStore, Message } from '../stores/chatStore'
import { useTaskStore } from '../stores/taskStore'

function ScreenshotPreview({ src }: { src: string }) {
  const [expanded, setExpanded] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreen) {
        setFullscreen(false)
      }
    }
    if (fullscreen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [fullscreen])

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-sigma-500 hover:text-sigma-accent transition-colors font-mono"
      >
        <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {expanded ? 'Hide screenshot' : 'View screenshot'}
      </button>
      {expanded && (
        <div className="mt-2 rounded-lg overflow-hidden border border-sigma-700/50 animate-fade-in">
          <img 
            src={src} 
            alt="Screen capture" 
            className="w-full h-auto cursor-zoom-in hover:opacity-90 transition-opacity" 
            onClick={() => setFullscreen(true)}
            title="Click to enlarge"
          />
        </div>
      )}
      
      {/* Fullscreen Modal */}
      {fullscreen && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center animate-fade-in"
          onClick={() => setFullscreen(false)}
        >
          <div className="relative max-w-[95vw] max-h-[95vh]">
            <img 
              src={src} 
              alt="Screen capture enlarged" 
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setFullscreen(false)}
              className="absolute top-4 right-4 p-2 bg-sigma-800/80 hover:bg-sigma-700 rounded-full text-white transition-colors shadow-lg"
              title="Close"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm font-mono bg-sigma-800/80 px-4 py-2 rounded-full">
              Click anywhere or press X to close
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3 animate-fade-in">
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 bg-sigma-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-sigma-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-sigma-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs text-sigma-500 ml-2 font-mono">Analyzing...</span>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  if (isSystem) {
    return (
      <div className="px-4 py-2 text-center animate-fade-in">
        <span className="text-[11px] text-sigma-500 bg-sigma-800/50 px-3 py-1 rounded-full font-mono">
          {message.content}
        </span>
      </div>
    )
  }

  return (
    <div className={`px-4 py-2 animate-fade-in ${isUser ? 'flex justify-end' : ''}`}>
      <div className={`max-w-[90%] ${isUser ? 'order-2' : ''}`}>
        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-gradient-to-r from-sigma-accent to-blue-600 text-white rounded-br-md'
              : 'bg-sigma-800/80 text-gray-100 rounded-bl-md border border-sigma-700/30'
          }`}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap font-sans">
            {message.content.split(/(\*\*[^*]+\*\*)/).map((part, i) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
              }
              return part
            })}
          </p>
        </div>
        {message.screenshot && <ScreenshotPreview src={message.screenshot} />}
        <p className={`text-[10px] text-sigma-500 mt-1 font-mono ${isUser ? 'text-right' : ''}`}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

function WelcomeMessage() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-8 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sigma-accent to-blue-600 flex items-center justify-center mb-6 shadow-xl shadow-sigma-accent/20 animate-pulse-glow">
        <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </div>
      <h2 className="font-display font-bold text-xl text-white mb-2">Welcome to SigmaGuide</h2>
      <p className="text-sigma-500 text-sm mb-6 leading-relaxed">
        Your AI assistant for step-by-step software guidance
      </p>
      
      <div className="w-full space-y-3">
        <div className="bg-sigma-800/50 rounded-xl p-4 border border-sigma-700/30 text-left">
          <p className="text-[11px] text-sigma-accent font-mono uppercase tracking-wider mb-2">Try asking</p>
          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-sigma-accent mt-0.5">→</span>
              <span>"How do I freeze the top row in Excel?"</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sigma-accent mt-0.5">→</span>
              <span>"Help me create a new branch in VS Code"</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sigma-accent mt-0.5">→</span>
              <span>"How do I split my screen on Mac?"</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2 text-[10px] text-sigma-500 font-mono">
        <kbd className="px-2 py-1 bg-sigma-700/50 rounded border border-sigma-600/50">⌘</kbd>
        <span>+</span>
        <kbd className="px-2 py-1 bg-sigma-700/50 rounded border border-sigma-600/50">⇧</kbd>
        <span>+</span>
        <kbd className="px-2 py-1 bg-sigma-700/50 rounded border border-sigma-600/50">G</kbd>
        <span className="ml-2">to toggle sidebar</span>
      </div>
    </div>
  )
}

export function MessageList() {
  const { messages, isLoading } = useChatStore()
  const { isAnalyzing } = useTaskStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  if (messages.length === 0 && !isLoading) {
    return <WelcomeMessage />
  }

  return (
    <div className="flex-1 overflow-y-auto py-4 space-y-1 scrollbar-thin scrollbar-thumb-sigma-700 scrollbar-track-transparent">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      {(isLoading || isAnalyzing) && <TypingIndicator />}
      <div ref={messagesEndRef} />
    </div>
  )
}






