import { create } from 'zustand'

export interface TaskStep {
  id: string
  instruction: string
  completed: boolean
  uiElement?: string
  action?: string
}

export interface Task {
  id: string
  goal: string
  steps: TaskStep[]
  currentStepIndex: number
  status: 'idle' | 'in_progress' | 'completed' | 'paused'
  appContext?: {
    app: string
    version: string
    os: string
    currentState: string
  }
}

interface TaskState {
  currentTask: Task | null
  isAnalyzing: boolean
  setTask: (task: Task | null) => void
  updateStep: (stepIndex: number, completed: boolean) => void
  advanceStep: () => void
  setAnalyzing: (analyzing: boolean) => void
  completeTask: () => void
  resetTask: () => void
}

export const useTaskStore = create<TaskState>((set) => ({
  currentTask: null,
  isAnalyzing: false,

  setTask: (task) => set({ currentTask: task }),

  updateStep: (stepIndex, completed) =>
    set((state) => {
      if (!state.currentTask) return state
      const steps = [...state.currentTask.steps]
      steps[stepIndex] = { ...steps[stepIndex], completed }
      return {
        currentTask: { ...state.currentTask, steps },
      }
    }),

  advanceStep: () =>
    set((state) => {
      if (!state.currentTask) return state
      const nextIndex = state.currentTask.currentStepIndex + 1
      const isCompleted = nextIndex >= state.currentTask.steps.length
      return {
        currentTask: {
          ...state.currentTask,
          currentStepIndex: isCompleted ? state.currentTask.currentStepIndex : nextIndex,
          status: isCompleted ? 'completed' : 'in_progress',
        },
      }
    }),

  setAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),

  completeTask: () =>
    set((state) => ({
      currentTask: state.currentTask
        ? { ...state.currentTask, status: 'completed' }
        : null,
    })),

  resetTask: () => set({ currentTask: null, isAnalyzing: false }),
}))






