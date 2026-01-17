import { useTaskStore } from '../stores/taskStore'
import { orchestrator } from '../agents/orchestrator'

export function Header() {
  const { currentTask, isAnalyzing } = useTaskStore()

  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow()
  }

  const handleClose = () => {
    window.electronAPI?.closeWindow()
  }

  const handleReset = () => {
    orchestrator.reset()
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
            {isAnalyzing && (
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
          {currentTask && (
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

      {/* Task progress bar */}
      {currentTask && currentTask.status === 'in_progress' && (
        <div className="mt-3 relative">
          <div className="flex items-center justify-between text-[10px] text-sigma-500 mb-1.5 font-mono">
            <span>Step {currentTask.currentStepIndex + 1} of {currentTask.steps.length}</span>
            <span>{Math.round(((currentTask.currentStepIndex) / currentTask.steps.length) * 100)}%</span>
          </div>
          <div className="h-1 bg-sigma-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-sigma-accent to-sigma-glow rounded-full transition-all duration-500 ease-out"
              style={{ width: `${((currentTask.currentStepIndex) / currentTask.steps.length) * 100}%` }}
            />
          </div>
        </div>
      )}
    </header>
  )
}






