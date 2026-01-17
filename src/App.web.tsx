import { useState, useRef, useEffect } from 'react'
import OpenAI from 'openai'
import './index.css'

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
  dangerouslyAllowBrowser: true
})

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `You are SigmaGuide, a friendly AI assistant that helps users with step-by-step software guidance.

Your role:
1. Give clear, step-by-step instructions
2. Be concise and direct
3. Reference exact UI elements by name and location
4. Use encouraging language
5. Break down complex tasks into simple steps

When users ask how to do something in software, provide:
- Numbered steps
- Specific UI elements to click
- Keyboard shortcuts when useful
- What to expect after each step

Keep responses helpful and easy to follow!`

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
    }
  }, [input])

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user', content: userMessage.content }
        ],
        max_tokens: 2048
      })

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.choices[0]?.message?.content || 'Sorry, I could not generate a response.'
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Error:', error)
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please check your API key and try again.'
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="min-h-screen bg-sigma-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl h-[90vh] flex flex-col bg-sigma-800/50 rounded-2xl border border-sigma-700/50 shadow-2xl overflow-hidden">
        {/* Header */}
        <header className="px-6 py-4 bg-gradient-to-r from-sigma-900 via-sigma-800 to-sigma-900 border-b border-sigma-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sigma-accent to-blue-600 flex items-center justify-center shadow-lg shadow-sigma-accent/25">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h1 className="font-display font-bold text-white text-lg">SigmaGuide</h1>
              <p className="text-xs text-sigma-500 font-mono">AI Software Assistant</p>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sigma-accent to-blue-600 flex items-center justify-center mb-6 shadow-xl shadow-sigma-accent/20">
                <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h2 className="font-display font-bold text-xl text-white mb-2">Welcome to SigmaGuide</h2>
              <p className="text-sigma-500 text-sm mb-6">Ask me how to do anything in any software</p>
              
              <div className="w-full space-y-2 text-left">
                <p className="text-xs text-sigma-accent font-mono uppercase tracking-wider mb-2">Try asking:</p>
                {[
                  "How do I freeze the top row in Excel?",
                  "How do I create a new branch in VS Code?",
                  "How do I split my screen on Mac?"
                ].map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(q)}
                    className="w-full text-left px-4 py-3 bg-sigma-700/30 hover:bg-sigma-700/50 rounded-xl text-sm text-gray-300 transition-colors border border-sigma-700/30"
                  >
                    <span className="text-sigma-accent mr-2">→</span>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-gradient-to-r from-sigma-accent to-blue-600 text-white rounded-br-md'
                      : 'bg-sigma-700/50 text-gray-100 rounded-bl-md border border-sigma-600/30'
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </p>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-sigma-700/50 rounded-2xl rounded-bl-md px-4 py-3 border border-sigma-600/30">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-sigma-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-sigma-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-sigma-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-sigma-700/50">
          <div className="relative bg-sigma-700/50 rounded-xl border border-sigma-600/30 focus-within:border-sigma-accent/50 focus-within:shadow-lg focus-within:shadow-sigma-accent/10 transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me how to do anything..."
              disabled={isLoading}
              rows={1}
              className="w-full bg-transparent text-gray-100 placeholder-sigma-500 text-sm px-4 py-3 pr-12 resize-none focus:outline-none"
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className={`absolute right-2 bottom-2 p-2 rounded-lg transition-all ${
                input.trim() && !isLoading
                  ? 'bg-sigma-accent text-white hover:bg-blue-600'
                  : 'bg-sigma-600/50 text-sigma-500 cursor-not-allowed'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
          <p className="text-[10px] text-sigma-500 text-center mt-2 font-mono">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  )
}

export default App





