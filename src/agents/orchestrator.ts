import { useChatStore } from '../stores/chatStore'
import { useTaskStore, Task } from '../stores/taskStore'
import { analyzeScreen, verifyStepCompletion } from './screenAnalyzer'
import { decomposeTask } from './taskDecomposer'
import { analyzeScreenshot, generateText, parseJsonResponse } from '../lib/openai'
import { PROMPTS } from '../lib/prompts'

interface IntentResult {
  intent: 'task' | 'greeting' | 'question' | 'followup' | 'unclear'
  confidence: number
  taskDescription: string | null
}

class Orchestrator {
  private lastScreenshot: string | null = null
  private lastScreenshotHash: string | null = null
  private monitoringInterval: ReturnType<typeof setInterval> | null = null
  private lastCheckTime = 0
  private lastMessageForStep: Map<number, string> = new Map()
  private readonly CHECK_INTERVAL = 1000 // Check every 1 second
  private readonly DEBOUNCE_DELAY = 200 // Wait 200ms after screen changes before processing
  private isProcessing = false // Prevent concurrent processing

  /**
   * Generate a simple hash from screenshot string for change detection
   */
  private hashScreenshot(screenshot: string): string {
    // Simple hash: use first 100 chars and last 100 chars for quick comparison
    // More efficient than full string comparison
    const start = screenshot.substring(0, 100)
    const end = screenshot.substring(Math.max(0, screenshot.length - 100))
    const combined = start + end
    // Use a simple hash code
    let hash = 0
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString()
  }

  /**
   * Capture current screen
   */
  async captureScreen(): Promise<string | null> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.captureScreen()
      
      // Handle error responses
      if (result && typeof result === 'object' && 'error' in result) {
        const errorResult = result as { error: string }
        console.log('Screen capture error:', errorResult.error)
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
   * Classify the user's intent
   */
  private async classifyIntent(userMessage: string): Promise<IntentResult> {
    const prompt = `${PROMPTS.intentClassifier}\n\nUser message: "${userMessage}"`
    
    const response = await generateText(prompt)
    
    if (response.error) {
      // Default to task if we can't classify
      return { intent: 'task', confidence: 0.5, taskDescription: userMessage }
    }
    
    const result = parseJsonResponse<IntentResult>(response.text)
    
    if (!result) {
      return { intent: 'task', confidence: 0.5, taskDescription: userMessage }
    }
    
    return result
  }

  /**
   * Handle conversational (non-task) messages
   */
  private async handleConversational(userMessage: string, intent: IntentResult['intent']): Promise<string> {
    const taskStore = useTaskStore.getState()
    const currentTask = taskStore.currentTask
    
    // Handle follow-up during active task
    if (intent === 'followup' && currentTask && currentTask.status === 'in_progress') {
      // User says "done", "next", etc. - advance to next step
      const nextStepIndex = currentTask.currentStepIndex + 1
      if (nextStepIndex < currentTask.steps.length) {
        taskStore.updateStep(currentTask.currentStepIndex, true)
        taskStore.advanceStep()
        const screenshot = await this.captureScreen()
        return await this.generateStepGuidance(
          { ...currentTask, currentStepIndex: nextStepIndex },
          nextStepIndex,
          screenshot
        )
      } else {
        taskStore.completeTask()
        this.stopStepMonitoring()
        // Capture final screenshot and set it so it gets attached to the response
        const finalScreenshot = await this.captureScreen()
        if (finalScreenshot) {
          useChatStore.getState().setScreenshot(finalScreenshot)
        }
        return `🎉 **All done!** You've completed "${currentTask.goal}". Let me know if you need help with anything else!`
      }
    }
    
    // Generate conversational response
    const prompt = `${PROMPTS.conversational}\n\nUser message: "${userMessage}"`
    const response = await generateText(prompt)
    
    if (response.error) {
      // Fallback responses
      if (intent === 'greeting') {
        return "Hey! 👋 What would you like help with today?"
      }
      return "I'm here to help you navigate software! Just tell me what you're trying to do."
    }
    
    return response.text
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
      // 1. Classify the user's intent first
      const intentResult = await this.classifyIntent(userMessage)
      console.log('Intent classified:', intentResult)
      
      // 2. Handle non-task intents conversationally
      if (intentResult.intent !== 'task' && intentResult.confidence > 0.6) {
        return await this.handleConversational(userMessage, intentResult.intent)
      }
      
      // 3. For tasks, capture and analyze screen
      const screenshot = await this.captureScreen()
      
      // If no screenshot, use text-only mode
      if (!screenshot) {
        console.log('Screen capture failed, using text-only mode')
        return await this.processTextOnly(userMessage)
      }

      this.lastScreenshot = screenshot

      // 4. Analyze current screen
      const analysis = await analyzeScreen(screenshot)
      
      if (!analysis) {
        return await this.processTextOnly(userMessage)
      }

      // 5. Decompose the task into steps (use extracted task description if available)
      const taskDescription = intentResult.taskDescription || userMessage
      const steps = await decomposeTask(taskDescription, analysis, screenshot)
      
      if (!steps || steps.length === 0) {
        return await this.processTextOnly(userMessage)
      }

      // 6. Create and store the task
      const task: Task = {
        id: crypto.randomUUID(),
        goal: taskDescription,
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

      // 7. Generate friendly guidance for first step
      const guidance = await this.generateStepGuidance(task, 0, screenshot)
      
      // 8. Start monitoring for step completion
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
    this.lastMessageForStep.clear() // Reset message tracking

    // Check at intervals
    this.monitoringInterval = setInterval(async () => {
      await this.checkStepCompletion()
    }, this.CHECK_INTERVAL)
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
   * Generate adaptive guidance when user takes a different path
   */
  private async generateAdaptiveGuidance(
    task: Task,
    currentScreenshot: string,
    expectedInstruction: string,
    verificationObservation: string
  ): Promise<string> {
    const step = task.steps[task.currentStepIndex]
    
    const prompt = `${PROMPTS.guidance}

Context:
- Application: ${task.appContext?.app || 'Unknown'}
- User's Goal: ${task.goal}
- Current Step: ${task.currentStepIndex + 1} of ${task.steps.length}
- Expected Action: ${expectedInstruction}
- What Actually Changed: ${verificationObservation}

The user's screen has changed, but they may have taken a different path than expected. Analyze the current screen state and provide guidance that adapts to what they actually did. 

If they're on the right track but just did it differently, encourage them and guide to the next step.
If they've gone off track, gently redirect them back to the correct path.
If they've completed the step in a different way, acknowledge it and move forward.

Give clear, adaptive guidance based on the actual current screen state.`

    const response = await analyzeScreenshot(currentScreenshot, prompt)
    if (!response.error && response.text) {
      return response.text
    }
    
    // Fallback
    return `I notice your screen has changed. ${verificationObservation}\n\n${step.instruction}\n\nIf you're ready, let's continue to the next step!`
  }

  /**
   * Check if user completed the current step
   */
  private async checkStepCompletion() {
    // Prevent concurrent processing
    if (this.isProcessing) return

    const taskStore = useTaskStore.getState()
    const chatStore = useChatStore.getState()
    const task = taskStore.currentTask

    if (!task || task.status !== 'in_progress') {
      this.stopStepMonitoring()
      return
    }

    // Debounce - don't check too frequently
    const now = Date.now()
    if (now - this.lastCheckTime < this.CHECK_INTERVAL) {
      return
    }
    this.lastCheckTime = now

    const currentStep = task.steps[task.currentStepIndex]
    if (!currentStep || currentStep.completed) return

    // Capture new screenshot
    const newScreenshot = await this.captureScreen()
    if (!newScreenshot || !this.lastScreenshot) {
      // Store initial screenshot
      if (newScreenshot && !this.lastScreenshot) {
        this.lastScreenshot = newScreenshot
        this.lastScreenshotHash = this.hashScreenshot(newScreenshot)
      }
      return
    }

    // Check if screenshot has actually changed using hash
    const newScreenshotHash = this.hashScreenshot(newScreenshot)
    if (newScreenshotHash === this.lastScreenshotHash) {
      // No change detected, skip processing
      return
    }

    // Wait a bit for UI to settle after change
    await new Promise(resolve => setTimeout(resolve, this.DEBOUNCE_DELAY))

    // Re-capture after delay to ensure stable state
    const stableScreenshot = await this.captureScreen()
    if (!stableScreenshot) return

    // Check again if still changed
    const stableHash = this.hashScreenshot(stableScreenshot)
    if (stableHash === this.lastScreenshotHash) {
      // False alarm, screen settled back
      return
    }

    this.isProcessing = true

    try {
      // Verify step completion with before/after comparison
      const verification = await verifyStepCompletion(
        this.lastScreenshot,
        stableScreenshot,
        currentStep.instruction
      )

      if (!verification) {
        // Verification failed - just update screenshot and wait for correct action
        this.lastScreenshot = stableScreenshot
        this.lastScreenshotHash = stableHash
        this.isProcessing = false
        return
      }

      // Step completed successfully
      if (verification.completed && verification.confidence > 0.7) {
        // Mark step as complete
        taskStore.updateStep(task.currentStepIndex, true)
        
        // Check if task is complete
        if (task.currentStepIndex >= task.steps.length - 1) {
          taskStore.completeTask()
          this.stopStepMonitoring()
          
          const completionKey = `complete-${stableHash}`
          const lastCompletionMessage = this.lastMessageForStep.get(-1)
          
          if (lastCompletionMessage !== completionKey) {
            chatStore.addMessage({
              role: 'assistant',
              content: `🎉 **Excellent!** You've completed all the steps. "${task.goal}" is done!`,
              screenshot: stableScreenshot
            })
            this.lastMessageForStep.set(-1, completionKey)
          }
        } else {
          // Advance to next step
          taskStore.advanceStep()
          
          // Generate guidance for next step
          const nextTask = useTaskStore.getState().currentTask
          if (nextTask) {
            const stepKey = `${nextTask.currentStepIndex}-${stableHash}`
            const lastMessage = this.lastMessageForStep.get(nextTask.currentStepIndex)
            
            // Only send if we haven't already sent guidance for this step
            if (!lastMessage || lastMessage !== stepKey) {
              const guidance = await this.generateStepGuidance(
                nextTask, 
                nextTask.currentStepIndex, 
                stableScreenshot
              )
              
              chatStore.addMessage({
                role: 'assistant',
                content: `✓ Step ${task.currentStepIndex + 1} done!\n\n${guidance}`,
                screenshot: stableScreenshot
              })
              
              this.lastMessageForStep.set(nextTask.currentStepIndex, stepKey)
            }
          }
        }

        this.lastScreenshot = stableScreenshot
        this.lastScreenshotHash = stableHash
      } else {
        // Screen changed but step not completed correctly - just update screenshot and wait
        this.lastScreenshot = stableScreenshot
        this.lastScreenshotHash = stableHash
      }
    } catch (error) {
      console.error('Error in checkStepCompletion:', error)
    } finally {
      this.isProcessing = false
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
    this.lastScreenshotHash = null
    this.lastMessageForStep.clear()
    this.isProcessing = false
    useTaskStore.getState().resetTask()
    useChatStore.getState().clearMessages()
  }
}

// Export singleton instance
export const orchestrator = new Orchestrator()
