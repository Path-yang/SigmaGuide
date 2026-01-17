import { useChatStore } from '../stores/chatStore'
import { useSettingsStore } from '../stores/settingsStore'
import { reactiveOrchestrator } from '../agents/reactiveOrchestrator'

export function Header() {
  const { isLoading } = useChatStore()
  const { windowMode, guidanceMode, setWindowMode, setGuidanceMode } = useSettingsStore()
  const currentGoal = reactiveOrchestrator.getCurrentGoal()

  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow()
  }

  const handleClose = () => {
    window.electronAPI?.closeWindow()
  }

  const handleReset = () => {
    reactiveOrchestrator.reset()
  }

  return (
    <header className="relative px-4 py-3 bg-gradient-to-r from-sigma-900 via-sigma-800 to-sigma-900 border-b border-sigma-700/50">
      {/* Glow effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-sigma-accent/5 via-transparent to-sigma-accent/5 pointer-events-none" />
      
      {/* Drag region */}
      <div className="absolute inset-0 -webkit-app-region-drag" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      
      <div className="relative flex items-center justify-between">
        {/* Logo and title */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sigma-accent to-blue-600 flex items-center justify-center shadow-lg shadow-sigma-accent/25">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            {isLoading && (
              <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-sigma-accent animate-pulse" />
            )}
          </div>
          <div>
            <h1 className="font-display font-semibold text-white text-sm tracking-wide">SigmaGuide</h1>
            <p className="text-[10px] text-sigma-500 font-mono">AI Screen Assistant</p>
          </div>
        </div>

        {/* Window controls */}
        <div className="flex items-center gap-1 -webkit-app-region-no-drag" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Window Mode Toggle */}
          <button
            onClick={() => setWindowMode(windowMode === 'sidebar' ? 'overlay' : 'sidebar')}
            className={`p-2 rounded-lg transition-all duration-200 ${
              windowMode === 'overlay' 
                ? 'text-sigma-accent bg-sigma-accent/10' 
                : 'text-sigma-500 hover:text-white hover:bg-sigma-700/50'
            }`}
            title={windowMode === 'sidebar' ? 'Switch to Overlay Mode' : 'Switch to Sidebar Mode'}
          >
            {windowMode === 'sidebar' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            )}
          </button>

          {/* Guidance Mode Toggle */}
          <button
            onClick={() => setGuidanceMode(guidanceMode === 'steps' ? 'single' : 'steps')}
            className={`p-2 rounded-lg transition-all duration-200 ${
              guidanceMode === 'single' 
                ? 'text-sigma-accent bg-sigma-accent/10' 
                : 'text-sigma-500 hover:text-white hover:bg-sigma-700/50'
            }`}
            title={guidanceMode === 'steps' ? 'Switch to Quick Answer Mode' : 'Switch to Step-by-Step Mode'}
          >
            {guidanceMode === 'steps' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            )}
          </button>

          {/* Divider */}
          <div className="w-px h-4 bg-sigma-700/50 mx-1" />

          {currentGoal && (
            <button
              onClick={handleReset}
              className="p-2 rounded-lg text-sigma-500 hover:text-white hover:bg-sigma-700/50 transition-all duration-200"
              title="Reset"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
          <button
            onClick={handleMinimize}
            className="p-2 rounded-lg text-sigma-500 hover:text-white hover:bg-sigma-700/50 transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg text-sigma-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Active goal indicator */}
      {currentGoal && (
        <div className="mt-3 relative">
          <div className="flex items-center text-[10px] text-sigma-accent font-mono">
            <span className="mr-2">🎯</span>
            <span className="truncate">{currentGoal}</span>
          </div>
        </div>
      )}
    </header>
  )
}






