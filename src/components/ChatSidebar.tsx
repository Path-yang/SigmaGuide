import { RefObject } from 'react'
import { Header } from './Header'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'

interface ChatSidebarProps {
  inputRef?: RefObject<HTMLTextAreaElement>
}

export function ChatSidebar({ inputRef }: ChatSidebarProps) {
  return (
    <div className="flex flex-col h-full relative">
      {/* Compact header */}
      <div className="flex-shrink-0">
        <Header />
      </div>
      
      {/* Search-first: Input at top (command palette style) */}
      <div className="flex-shrink-0 border-b border-sigma-700/30">
        <MessageInput inputRef={inputRef} />
      </div>
      
      {/* Messages list - scrollable */}
      <div className="flex-1 min-h-0 flex flex-col">
        <MessageList />
      </div>
    </div>
  )
}






