import { useChatStore } from '../stores/chatStore'
import { useSettingsStore } from '../stores/settingsStore'
import { reactiveOrchestrator } from '../agents/reactiveOrchestrator'

export function Header() {
  const { isLoading } = useChatStore()
  const { guidanceMode, setGuidanceMode } = useSettingsStore()
  const currentGoal = reactiveOrchestrator.getCurrentGoal()

  const handleReset = () => {
    reactiveOrchestrator.reset()
  }

  return (
    <header className="relative px-5 py-3 border-b border-sigma-700/30" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-center justify-between">
        {/* Logo and title - compact */}
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sigma-accent to-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            {isLoading && (
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-sigma-accent animate-pulse" />
            )}
          </div>
          <div>
            <h1 className="font-display font-semibold text-white text-sm">SigmaGuide</h1>
          </div>
        </div>

        {/* Right side controls - minimal */}
        <div className="flex items-center gap-2">
          {/* Guidance Mode Toggle */}
          <button
            onClick={() => setGuidanceMode(guidanceMode === 'steps' ? 'single' : 'steps')}
            className={`px-2.5 py-1.5 rounded-md text-xs transition-all duration-200 ${
              guidanceMode === 'single' 
                ? 'text-sigma-accent bg-sigma-accent/10' 
                : 'text-sigma-500 hover:text-white hover:bg-sigma-700/50'
            }`}
            title={guidanceMode === 'steps' ? 'Quick Answer Mode' : 'Step-by-Step Mode'}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {guidanceMode === 'steps' ? 'Steps' : 'Quick'}
          </button>

          {currentGoal && (
            <button
              onClick={handleReset}
              className="px-2.5 py-1.5 rounded-md text-xs text-sigma-500 hover:text-white hover:bg-sigma-700/50 transition-all duration-200"
              title="Reset"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Active goal indicator - compact */}
      {currentGoal && (
        <div className="mt-2 pt-2 border-t border-sigma-700/20">
          <div className="flex items-center text-[10px] text-sigma-accent font-mono">
            <span className="mr-1.5">🎯</span>
            <span className="truncate">{currentGoal}</span>
          </div>
        </div>
      )}
    </header>
  )
}






