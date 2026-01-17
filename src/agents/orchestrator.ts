import { useChatStore } from '../stores/chatStore'
import { useTaskStore, Task } from '../stores/taskStore'
import { analyzeScreen, verifyStepCompletion } from './screenAnalyzer'
import { decomposeTask } from './taskDecomposer'
import { analyzeScreenshot, generateText } from '../lib/openai'
import { PROMPTS } from '../lib/prompts'

class Orchestrator {
  private lastScreenshot: string | null = null
  private monitoringInterval: ReturnType<typeof setInterval> | null = null

  /**
   * Capture current screen
   */
  async captureScreen(): Promise<string | null> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.captureScreen()
      
      // Handle error responses
      if (result && typeof result === 'object' && 'error' in result) {
        console.log('Screen capture error:', result.error)
        return null
      }
      
      if (result && typeof result === 'string') {
        useChatStore.getState().setScreenshot(result)
        return result
      }
    }
    return null
  }

  /**
   * Process a user message and generate guidance
   */
  async processUserMessage(userMessage: string): Promise<string> {
    const chatStore = useChatStore.getState()
    const taskStore = useTaskStore.getState()

    chatStore.setLoading(true)
    taskStore.setAnalyzing(true)

    try {
      // 1. Try to capture current screen
      const screenshot = await this.captureScreen()
      
      // If no screenshot, use text-only mode
      if (!screenshot) {
        console.log('Screen capture failed, using text-only mode')
        return await this.processTextOnly(userMessage)
      }

      this.lastScreenshot = screenshot

      // 2. Analyze current screen
      const analysis = await analyzeScreen(screenshot)
      
      if (!analysis) {
        return await this.processTextOnly(userMessage)
      }

      // 3. Decompose the task into steps
      const steps = await decomposeTask(userMessage, analysis, screenshot)
      
      if (!steps || steps.length === 0) {
        return await this.processTextOnly(userMessage)
      }

      // 4. Create and store the task
      const task: Task = {
        id: crypto.randomUUID(),
        goal: userMessage,
        steps,
        currentStepIndex: 0,
        status: 'in_progress',
        appContext: {
          app: analysis.app,
          version: analysis.version,
          os: analysis.os,
          currentState: analysis.currentState
        }
      }

      taskStore.setTask(task)

      // 5. Generate friendly guidance for first step
      const guidance = await this.generateStepGuidance(task, 0, screenshot)
      
      // 6. Start monitoring for step completion
      this.startStepMonitoring()

      return guidance
    } catch (error) {
      console.error('Orchestrator error:', error)
      return "Something went wrong. Please try again."
    } finally {
      chatStore.setLoading(false)
      taskStore.setAnalyzing(false)
    }
  }

  /**
   * Process in text-only mode (no screenshot)
   */
  private async processTextOnly(userMessage: string): Promise<string> {
    const prompt = `${PROMPTS.guidance}

The user asked: "${userMessage}"

I cannot see the user's screen right now, but please provide helpful step-by-step guidance for this task. Be specific about what UI elements to look for and where they're typically located.

Note: Since I can't see your screen, these are general instructions. Let me know if you need help with a specific step!`

    const response = await generateText(prompt)
    
    if (response.error) {
      return `I can help with that! Here's what you typically need to do:\n\n${userMessage}\n\nPlease note: Screen capture isn't working right now. Try logging out and back in to enable screen recording permissions, then restart the app.`
    }

    return response.text + "\n\n*Note: Screen capture is currently unavailable. For visual guidance, please log out and log back in to activate screen recording permissions.*"
  }

  /**
   * Generate friendly guidance for a specific step
   */
  private async generateStepGuidance(
    task: Task, 
    stepIndex: number, 
    screenshot: string | null
  ): Promise<string> {
    const step = task.steps[stepIndex]
    const totalSteps = task.steps.length
    
    const prompt = `${PROMPTS.guidance}

Context:
- Application: ${task.appContext?.app || 'Unknown'}
- User's Goal: ${task.goal}
- Current Step: ${stepIndex + 1} of ${totalSteps}
- Step Instruction: ${step.instruction}
- UI Element: ${step.uiElement || 'N/A'}
- Action Type: ${step.action || 'N/A'}

Give the user clear guidance for this step. Be specific about what they should click/do and where to find it on screen.`

    if (screenshot) {
      const response = await analyzeScreenshot(screenshot, prompt)
      if (!response.error) {
        return response.text
      }
    }
    
    // Fallback to text-only
    const response = await generateText(prompt)
    return response.error ? step.instruction : response.text
  }

  /**
   * Start monitoring screen for step completion
   */
  startStepMonitoring() {
    // Clear any existing monitoring
    this.stopStepMonitoring()

    // Check every 2 seconds
    this.monitoringInterval = setInterval(async () => {
      await this.checkStepCompletion()
    }, 2000)
  }

  /**
   * Stop monitoring
   */
  stopStepMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }
  }

  /**
   * Check if user completed the current step
   */
  private async checkStepCompletion() {
    const taskStore = useTaskStore.getState()
    const chatStore = useChatStore.getState()
    const task = taskStore.currentTask

    if (!task || task.status !== 'in_progress') {
      this.stopStepMonitoring()
      return
    }

    const currentStep = task.steps[task.currentStepIndex]
    if (!currentStep || currentStep.completed) return

    // Capture new screenshot
    const newScreenshot = await this.captureScreen()
    if (!newScreenshot || !this.lastScreenshot) return

    // Skip if screenshot hasn't changed much (basic check)
    if (newScreenshot === this.lastScreenshot) return

    // Verify step completion
    const verification = await verifyStepCompletion(
      this.lastScreenshot,
      newScreenshot,
      currentStep.instruction
    )

    if (verification && verification.completed && verification.confidence > 0.7) {
      // Mark step as complete
      taskStore.updateStep(task.currentStepIndex, true)
      
      // Check if task is complete
      if (task.currentStepIndex >= task.steps.length - 1) {
        taskStore.completeTask()
        this.stopStepMonitoring()
        
        chatStore.addMessage({
          role: 'assistant',
          content: `🎉 **Excellent!** You've completed all the steps. "${task.goal}" is done!`
        })
      } else {
        // Advance to next step
        taskStore.advanceStep()
        
        // Generate guidance for next step
        const nextTask = useTaskStore.getState().currentTask
        if (nextTask) {
          const guidance = await this.generateStepGuidance(
            nextTask, 
            nextTask.currentStepIndex, 
            newScreenshot
          )
          
          chatStore.addMessage({
            role: 'assistant',
            content: `✓ Step ${task.currentStepIndex + 1} done!\n\n${guidance}`,
            screenshot: newScreenshot
          })
        }
      }

      this.lastScreenshot = newScreenshot
    }
  }

  /**
   * Skip current step
   */
  async skipStep() {
    const taskStore = useTaskStore.getState()
    const chatStore = useChatStore.getState()
    const task = taskStore.currentTask

    if (!task || task.status !== 'in_progress') return

    taskStore.updateStep(task.currentStepIndex, true)
    taskStore.advanceStep()

    const updatedTask = useTaskStore.getState().currentTask
    if (updatedTask && updatedTask.status === 'in_progress') {
      const screenshot = await this.captureScreen()
      const guidance = await this.generateStepGuidance(
        updatedTask,
        updatedTask.currentStepIndex,
        screenshot
      )
      chatStore.addMessage({
        role: 'assistant',
        content: guidance
      })
    }
  }

  /**
   * Reset and start fresh
   */
  reset() {
    this.stopStepMonitoring()
    this.lastScreenshot = null
    useTaskStore.getState().resetTask()
    useChatStore.getState().clearMessages()
  }
}

// Export singleton instance
export const orchestrator = new Orchestrator()
