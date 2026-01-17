import { Header } from './Header'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'

export function ChatSidebar() {
  return (
    <div className="flex flex-col h-screen bg-sigma-900/95 backdrop-blur-xl">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-sigma-accent/5 via-transparent to-sigma-accent/5 pointer-events-none" />
      
      {/* Animated border glow */}
      <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-sigma-accent/30 to-transparent" />
      
      {/* Content */}
      <div className="relative flex flex-col h-full">
        <Header />
        <MessageList />
        <MessageInput />
      </div>
    </div>
  )
}






