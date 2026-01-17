import { useChatStore } from '../stores/chatStore'
import { analyzeScreenWithClaude, classifyIntentClaude } from '../lib/claude'

/**
 * Reactive Orchestrator - A simpler, more reliable approach
 * 
 * Instead of pre-planning steps and verifying each one, we:
 * 1. Know the user's goal
 * 2. Look at the current screen
 * 3. Tell them the ONE action to take
 * 4. Repeat until goal is done
 */
class ReactiveOrchestrator {
  private currentGoal: string | null = null
  private lastGuidance: string | null = null
  private lastScreenshot: string | null = null
  private monitoringInterval: ReturnType<typeof setInterval> | null = null
  private isProcessing = false
  private hotkeyListenerCleanup: (() => void) | null = null
  
  // Background monitoring only for MAJOR changes (new popup/dialog)
  private readonly CHECK_INTERVAL = 5000 // Check every 5 seconds (just for popup detection)
  private readonly POPUP_DETECTION_THRESHOLD = 15000 // 15000+ char diff = likely new popup/dialog

  /**
   * Capture current screen
   */
  async captureScreen(): Promise<string | null> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.captureScreen()
      
      if (result && typeof result === 'object' && 'error' in result) {
        console.log('Screen capture error:', (result as { error: string }).error)
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
   * Check if a MAJOR screen change happened (new popup/dialog appeared)
   * This is ONLY for background popup detection, not regular changes
   */
  private hasMajorScreenChange(screenshot: string): boolean {
    if (!this.lastScreenshot) {
      this.lastScreenshot = screenshot
      return false // First screenshot, don't trigger
    }
    
    const lengthDiff = Math.abs(screenshot.length - this.lastScreenshot.length)
    
    // Only trigger for VERY large changes (likely a new popup/dialog)
    if (lengthDiff >= this.POPUP_DETECTION_THRESHOLD) {
      console.log(`Major screen change detected: ${lengthDiff} chars diff (popup?)`)
      return true
    }
    
    return false
  }
  
  /**
   * Normalize guidance text for comparison
   */
  private normalizeGuidance(text: string): string {
    return text
      .toLowerCase()
      .replace(/[*_`]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 80)
  }
  
  /**
   * Manual trigger - user pressed hotkey to get guidance
   */
  async triggerManualCheck(): Promise<void> {
    if (this.isProcessing || !this.currentGoal) {
      console.log('Manual check skipped: no goal or already processing')
      return
    }
    
    console.log('Manual guidance check triggered')
    this.isProcessing = true
    
    try {
      const screenshot = await this.captureScreen()
      if (!screenshot) return
      
      // Update stored screenshot
      this.lastScreenshot = screenshot
      
      // Get guidance from Claude
      const response = await analyzeScreenWithClaude(
        screenshot,
        this.currentGoal,
        this.lastGuidance || undefined
      )
      
      if (response.error) {
        console.error('Claude error:', response.error)
        return
      }
      
      if (!response.text) return
      
      // Check for completion - more robust detection
      const trimmedResponse = response.text.trim()
      const lowerResponse = trimmedResponse.toLowerCase()
      const isComplete = lowerResponse.startsWith('done!') || 
                         lowerResponse.startsWith('done.') ||
                         lowerResponse.startsWith('🎉') ||
                         lowerResponse.startsWith('complete!') ||
                         lowerResponse.startsWith('finished!') ||
                         lowerResponse.startsWith('success!') ||
                         (lowerResponse.includes('successfully') && lowerResponse.includes('created')) ||
                         (lowerResponse.includes('goal') && lowerResponse.includes('achieved'))
      
      if (isComplete) {
        const chatStore = useChatStore.getState()
        chatStore.addMessage({
          role: 'assistant',
          content: trimmedResponse.startsWith('🎉') ? trimmedResponse : `🎉 ${trimmedResponse}`,
          screenshot
        })
        this.currentGoal = null
        this.stopMonitoring()
        return
      }
      
      // Send guidance
      const chatStore = useChatStore.getState()
      chatStore.addMessage({
        role: 'assistant',
        content: response.text,
        screenshot
      })
      this.lastGuidance = response.text
    } catch (error) {
      console.error('Manual check error:', error)
    } finally {
      this.isProcessing = false
    }
  }
  
  /**
   * Setup hotkey listener
   */
  setupHotkeyListener(): void {
    if (typeof window !== 'undefined' && window.electronAPI?.onTriggerGuidanceCheck) {
      this.hotkeyListenerCleanup = window.electronAPI.onTriggerGuidanceCheck(() => {
        this.triggerManualCheck()
      })
      console.log('Hotkey listener setup: Ctrl+Shift+Space')
    }
  }

  /**
   * Process a user message
   */
  async processUserMessage(userMessage: string): Promise<string> {
    const chatStore = useChatStore.getState()
    chatStore.setLoading(true)

    try {
      // Classify intent
      const { isTask, task } = await classifyIntentClaude(userMessage)
      
      if (!isTask) {
        // Just a greeting or question, respond conversationally
        return this.handleConversation(userMessage)
      }

      // It's a task - capture screen and start guiding
      this.currentGoal = task
      this.lastGuidance = null
      
      const screenshot = await this.captureScreen()
      
      if (!screenshot) {
        return "I can't see your screen right now. Please make sure screen capture is enabled and try again."
      }

      // Get initial guidance
      const response = await analyzeScreenWithClaude(screenshot, this.currentGoal)
      
      if (response.error) {
        return `I encountered an error: ${response.error}. Please try again.`
      }

      this.lastGuidance = response.text
      
      // Start monitoring for changes
      this.startMonitoring()

      return response.text
    } catch (error) {
      console.error('Orchestrator error:', error)
      return "Something went wrong. Please try again."
    } finally {
      chatStore.setLoading(false)
    }
  }

  /**
   * Handle non-task messages
   */
  private async handleConversation(message: string): Promise<string> {
    const lowerMessage = message.toLowerCase()
    
    if (lowerMessage.includes('hi') || lowerMessage.includes('hello') || lowerMessage.includes('hey')) {
      return "Hey! 👋 What would you like help with today? Just tell me what you're trying to do!"
    }
    
    if (lowerMessage.includes('thank')) {
      return "You're welcome! Let me know if you need help with anything else."
    }
    
    if (lowerMessage.includes('done') || lowerMessage.includes('next')) {
      if (this.currentGoal) {
        // User says they're done, check the screen
        const screenshot = await this.captureScreen()
        if (screenshot) {
          const response = await analyzeScreenWithClaude(screenshot, this.currentGoal, this.lastGuidance || undefined)
          if (!response.error) {
            this.lastGuidance = response.text
            return response.text
          }
        }
      }
      return "What would you like help with?"
    }
    
    return "I'm here to help you navigate software! Just tell me what you're trying to do, and I'll guide you step by step."
  }

  /**
   * Start background monitoring (only for popup/dialog detection)
   */
  private startMonitoring() {
    this.stopMonitoring()
    this.setupHotkeyListener()
    
    // Background check only for major changes (popup detection)
    this.monitoringInterval = setInterval(async () => {
      await this.checkForPopups()
    }, this.CHECK_INTERVAL)
    
    console.log('Monitoring started - Press Ctrl+Shift+Space for guidance')
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }
    if (this.hotkeyListenerCleanup) {
      this.hotkeyListenerCleanup()
      this.hotkeyListenerCleanup = null
    }
  }

  /**
   * Background check - only responds to MAJOR changes (new popup/dialog)
   * Does NOT spam for minor changes
   */
  private async checkForPopups() {
    if (this.isProcessing || !this.currentGoal) return
    
    try {
      const screenshot = await this.captureScreen()
      if (!screenshot) return
      
      // Only respond if there's a MAJOR change (new popup likely appeared)
      if (!this.hasMajorScreenChange(screenshot)) {
        return
      }
      
      console.log('Major change detected - auto-checking')
      this.isProcessing = true
      
      // Update stored screenshot
      this.lastScreenshot = screenshot
      
      // Get guidance from Claude
      const response = await analyzeScreenWithClaude(
        screenshot,
        this.currentGoal,
        this.lastGuidance || undefined
      )
      
      if (response.error || !response.text) {
        return
      }
      
      // Only send if meaningfully different
      const normalizedNew = this.normalizeGuidance(response.text)
      const normalizedOld = this.lastGuidance ? this.normalizeGuidance(this.lastGuidance) : ''
      
      if (normalizedNew !== normalizedOld) {
        const chatStore = useChatStore.getState()
        
        // Check for completion - same robust detection as manual check
        const trimmed = response.text.trim().toLowerCase()
        const isComplete = trimmed.startsWith('done!') || 
                           trimmed.startsWith('done.') ||
                           trimmed.startsWith('🎉') ||
                           trimmed.startsWith('complete!') ||
                           trimmed.startsWith('finished!') ||
                           (trimmed.includes('successfully') && trimmed.includes('created'))
        
        if (isComplete) {
          chatStore.addMessage({
            role: 'assistant',
            content: `🎉 ${response.text}`,
            screenshot
          })
          this.currentGoal = null
          this.stopMonitoring()
        } else {
          chatStore.addMessage({
            role: 'assistant',
            content: `💡 *Screen changed*\n\n${response.text}`,
            screenshot
          })
          this.lastGuidance = response.text
        }
      }
    } catch (error) {
      console.error('Popup check error:', error)
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Reset everything
   */
  reset() {
    this.stopMonitoring()
    this.currentGoal = null
    this.lastGuidance = null
    this.lastScreenshot = null
    this.isProcessing = false
    useChatStore.getState().clearMessages()
  }

  /**
   * Get current goal
   */
  getCurrentGoal(): string | null {
    return this.currentGoal
  }
}

// Export singleton
export const reactiveOrchestrator = new ReactiveOrchestrator()
