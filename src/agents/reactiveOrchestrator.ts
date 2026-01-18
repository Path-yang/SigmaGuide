import { useChatStore } from '../stores/chatStore'
import { useSettingsStore } from '../stores/settingsStore'
import { analyzeScreenWithClaude, classifyIntentClaude, quickAnswerClaude } from '../lib/claude'
import { parseCoordinatesFromResponse, ParsedCoordinates } from '../lib/coordinateParser'
import { TargetDescription } from '../lib/coordinateParser'

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
  private clickMonitoringCleanup: (() => void) | null = null
  private globalClickMonitoringCleanup: (() => void) | null = null
  private isProcessing = false
  private hotkeyListenerCleanup: (() => void) | null = null

  // Background monitoring only for MAJOR changes (new popup/dialog)
  private readonly CLICK_DEBOUNCE = 1000 // Minimum time between click-triggered checks (ms)
  private readonly POPUP_DETECTION_THRESHOLD = 15000 // 15000+ char diff = likely new popup/dialog
  private lastPopupCheckTime = 0

  /**
   * Resolve coordinates using Accessibility API (macOS only)
   * Returns coordinates in screen space (no mapping needed)
   */
  private async resolveCoordinatesViaAccessibility(
    target: TargetDescription
  ): Promise<ParsedCoordinates | null> {
    // Check platform (macOS only)
    if (typeof window === 'undefined') {
      console.log('🔍 [Accessibility API] Skipped: window is undefined (not in browser context)')
      return null
    }

    if (!window.electronAPI) {
      console.log('🔍 [Accessibility API] Skipped: electronAPI is not available')
      return null
    }

    if (!window.electronAPI.findElementAccessibility) {
      console.log('🔍 [Accessibility API] Skipped: findElementAccessibility method not available')
      return null
    }

    // Platform check - Accessibility API is macOS only
    if (typeof process !== 'undefined' && process.platform !== 'darwin') {
      console.log('🔍 [Accessibility API] Skipped: Not running on macOS (platform:', process.platform, ')')
      return null
    }

    try {
      console.log('🔍 [Accessibility API] Calling findElementAccessibility for target:', target.text)
      console.log('🔍 [Accessibility API] Search parameters:', {
        text: target.text,
        type: target.type || 'any',
        context: target.context || 'none'
      })

      const result = await window.electronAPI.findElementAccessibility({
        text: target.text,
        type: target.type,
        context: target.context
      })

      if (result) {
        console.log('🔍 [Accessibility API] Success: Found element at', {
          x: result.x,
          y: result.y,
          width: result.width,
          height: result.height
        })
        // Accessibility API provides top-left coordinates, convert to center for consistency
        return {
          x: result.x + (result.width / 2),
          y: result.y + (result.height / 2),
          width: result.width,
          height: result.height,
          coordinateSource: 'accessibility' as const
        }
      } else {
        console.log('🔍 [Accessibility API] Failed: Element not found in accessibility tree')
      }
    } catch (error) {
      console.log('🔍 [Accessibility API] Error during lookup:', error)
    }

    return null
  }

  /**
   * Resolve coordinates using hybrid approach:
   * 1. If we have a target description, try Accessibility API first (most accurate)
   * 2. Fall back to AI-provided coordinates if Accessibility API fails
   */
  private async resolveCoordinates(
    target: TargetDescription | undefined,
    fallbackCoords: ParsedCoordinates | undefined,
    screenshot: string
  ): Promise<ParsedCoordinates | null> {
    // Step 1: Try Accessibility API first (macOS only, most accurate)
    if (target && target.text) {
      console.log('🔍 [Accessibility API] Attempting to resolve coordinates via Accessibility API')
      console.log('🔍 [Accessibility API] Target:', { text: target.text, type: target.type, context: target.context })
      const accessibilityCoords = await this.resolveCoordinatesViaAccessibility(target)
      if (accessibilityCoords) {
        console.log('🔍 [Accessibility API] Successfully resolved coordinates:', accessibilityCoords)
        console.log('📊 [Coordinate Resolution Summary] Method: Accessibility API (primary)')
        return accessibilityCoords
      } else {
        console.log('🔍 [Accessibility API] Failed to resolve coordinates, falling back to AI-provided coordinates')
      }
    } else {
      if (!target) {
        console.log('🔍 [Accessibility API] Skipped: No target description provided')
      } else if (!target.text) {
        console.log('🔍 [Accessibility API] Skipped: Target exists but has no text property', { target })
      }
    }

    // Step 2: Fall back to AI-provided coordinates
    if (fallbackCoords) {
      console.log('🔍 [AI Fallback] Using AI-provided coordinates:', fallbackCoords)
      console.log('📊 [Coordinate Resolution Summary] Method: AI-provided coordinates (fallback)')
      return {
        ...fallbackCoords,
        coordinateSource: 'ai' as const
      }
    }

    console.log('📊 [Coordinate Resolution Summary] Method: None - All methods failed')
    console.log('📊 [Coordinate Resolution Summary] Decision path:', {
      hadTarget: !!target,
      hadTargetText: !!(target && target.text),
      hadFallbackCoords: !!fallbackCoords
    })
    return null
  }

  /**
   * Show overlay highlight with resolved coordinates
   */
  private async showHighlight(coords: ParsedCoordinates, responseText?: string): Promise<void> {
    if (typeof window !== 'undefined' && window.electronAPI?.showOverlayHighlight) {
      // Hide loading indicator when highlight appears
      if (window.electronAPI?.hideLoadingIndicator) {
        await window.electronAPI.hideLoadingIndicator()
      }

      // Clear existing highlights before showing new one
      this.clearHighlights()

      const highlightId = `highlight-${Date.now()}`
      console.log('📍 [Highlight] Sending highlight to overlay:', {
        id: highlightId,
        x: coords.x,
        y: coords.y,
        coordinateSource: coords.coordinateSource,
        width: coords.width,
        height: coords.height
      })
      try {
        await window.electronAPI.showOverlayHighlight({
          id: highlightId,
          x: coords.x,
          y: coords.y,
          coordinateSource: coords.coordinateSource
        })
        console.log('📍 [Highlight] Highlight sent successfully')

        // Send speech bubble if response text is provided
        if (responseText && window.electronAPI?.showSpeechBubble) {
          // Calculate radius (use a default if not provided)
          const radius = 30 // Default radius for speech bubble positioning
          await window.electronAPI.showSpeechBubble({
            text: responseText,
            x: coords.x,
            y: coords.y,
            radius: radius
          })
          console.log('💬 [Speech Bubble] Speech bubble sent successfully')
        }
      } catch (error) {
        console.error('Error sending highlight:', error)
      }
    }
  }

  /**
   * Clear overlay highlights
   */
  private clearHighlights(): void {
    if (typeof window !== 'undefined' && window.electronAPI?.clearOverlayHighlights) {
      window.electronAPI.clearOverlayHighlights()
    }
  }

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
   * Extract image dimensions from base64 data URL
   */
  private getImageDimensions(dataUrl: string): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        resolve({ width: img.width, height: img.height })
      }
      img.onerror = () => {
        resolve(null)
      }
      img.src = dataUrl
    })
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

      // Parse coordinates from response
      const parsed = parseCoordinatesFromResponse(response.text)

      if (isComplete) {
        const chatStore = useChatStore.getState()
        chatStore.addMessage({
          role: 'assistant',
          content: trimmedResponse.startsWith('🎉') ? trimmedResponse : `🎉 ${trimmedResponse}`,
          screenshot
        })
        // Hide overlay when task completes
        if (typeof window !== 'undefined' && window.electronAPI?.hideOverlay) {
          window.electronAPI.hideOverlay()
        }
        this.currentGoal = null
        this.stopMonitoring()
        return
      }

      // Send guidance
      const chatStore = useChatStore.getState()
      chatStore.addMessage({
        role: 'assistant',
        content: parsed.text,
        screenshot
      })
      this.lastGuidance = parsed.text

      // Resolve coordinates using hybrid approach
      const resolvedCoords = await this.resolveCoordinates(
        parsed.target,
        parsed.coordinates,
        screenshot
      )

      if (resolvedCoords) {
        await this.showHighlight(resolvedCoords)
      } else {
        this.clearHighlights()
      }
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
    const { guidanceMode } = useSettingsStore.getState()
    chatStore.setLoading(true)

    // Start click monitoring when user sends a message
    this.startGlobalClickMonitoring()

    try {
      // Classify intent
      const { isTask, task } = await classifyIntentClaude(userMessage)

      if (!isTask) {
        // Just a greeting or question, respond conversationally
        return this.handleConversation(userMessage)
      }

      // Capture screen
      const screenshot = await this.captureScreen()

      if (!screenshot) {
        return "I can't see your screen right now. Please make sure screen capture is enabled and try again."
      }

      // SINGLE MODE: Just answer the question, no task tracking
      if (guidanceMode === 'single') {
        const response = await quickAnswerClaude(screenshot, task)

        if (response.error) {
          return `I encountered an error: ${response.error}. Please try again.`
        }

        return response.text
      }

      // STEPS MODE: Full task tracking with progress
      this.currentGoal = task
      this.lastGuidance = null

      // Get initial guidance
      const dimensions = await this.getImageDimensions(screenshot)
      const response = await analyzeScreenWithClaude(
        screenshot,
        this.currentGoal,
        undefined,
        dimensions || undefined
      )

      if (response.error) {
        return `I encountered an error: ${response.error}. Please try again.`
      }

      // Parse target/coordinates from response
      console.log('Raw AI response:', response.text)
      const parsed = parseCoordinatesFromResponse(response.text)
      this.lastGuidance = parsed.text

      console.log('Parsed response:', {
        hasTarget: !!parsed.target,
        target: parsed.target,
        hasCoordinates: !!parsed.coordinates,
        coordinates: parsed.coordinates,
        text: parsed.text
      })

      // Log the full response for debugging if nothing was found
      if (!parsed.target && !parsed.coordinates) {
        console.warn('⚠️ No target or coordinates found in AI response')
        console.warn('Full response:', response.text)
        // Try to find any JSON-like structure
        const jsonMatch = response.text.match(/\{[^}]*\}/)
        if (jsonMatch) {
          console.warn('Found potential JSON:', jsonMatch[0])
        }
      }

      // Resolve coordinates using hybrid approach (Accessibility API + AI fallback)
      console.log('📊 [Coordinate Resolution] Starting coordinate resolution process')
      const resolvedCoords = await this.resolveCoordinates(
        parsed.target,
        parsed.coordinates,
        screenshot
      )

      if (resolvedCoords) {
        console.log('📊 [Coordinate Resolution] Final result: Coordinates resolved successfully', {
          x: resolvedCoords.x,
          y: resolvedCoords.y,
          width: resolvedCoords.width,
          height: resolvedCoords.height
        })
        await this.showHighlight(resolvedCoords, parsed.text)
      } else {
        console.log('📊 [Coordinate Resolution] Final result: No coordinates resolved - all methods failed')
        this.clearHighlights()
      }

      // Start monitoring for changes
      this.startMonitoring()

      return parsed.text
    } catch (error) {
      console.error('Orchestrator error:', error)
      // Hide loading indicator on error
      if (typeof window !== 'undefined' && window.electronAPI?.hideLoadingIndicator) {
        await window.electronAPI.hideLoadingIndicator()
      }
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
          const dimensions = await this.getImageDimensions(screenshot)
          const response = await analyzeScreenWithClaude(
            screenshot,
            this.currentGoal,
            this.lastGuidance || undefined,
            dimensions || undefined
          )
          if (!response.error) {
            // Parse target/coordinates from response
            const parsed = parseCoordinatesFromResponse(response.text)
            this.lastGuidance = parsed.text

            // Resolve coordinates using hybrid approach
            const resolvedCoords = await this.resolveCoordinates(
              parsed.target,
              parsed.coordinates,
              screenshot
            )

            if (resolvedCoords) {
              await this.showHighlight(resolvedCoords, parsed.text)
            }

            return parsed.text
          }
        }
      }
      return "What would you like help with?"
    }

    return "I'm here to help you navigate software! Just tell me what you're trying to do, and I'll guide you step by step."
  }

  /**
   * Handle click event: take screenshot and send to AI
   * Public method that can be called from anywhere
   */
  async handleClickEvent(event: { type: string; button: string; x: number; y: number; timestamp: number }): Promise<void> {
    if (this.isProcessing) {
      console.log('Already processing, skipping click handler')
      return
    }

    console.log(`🖱️ Click detected: ${event.button} button at (${event.x}, ${event.y})`)
    this.isProcessing = true

    // Show loading indicator on overlay
    if (typeof window !== 'undefined' && window.electronAPI?.showLoadingIndicator) {
      await window.electronAPI.showLoadingIndicator()
    }

    try {
      // Take screenshot
      const screenshot = await this.captureScreen()
      if (!screenshot) {
        console.log('Failed to capture screen')
        // Hide loading if capture fails
        if (typeof window !== 'undefined' && window.electronAPI?.hideLoadingIndicator) {
          await window.electronAPI.hideLoadingIndicator()
        }
        return
      }

      // Use analyzeScreenWithClaude to get actionable steps with coordinates
      // Use the original goal if available, otherwise use a generic prompt
      const goal = this.currentGoal || "What is the next action the user should take on this screen? Provide ONE clear, actionable step."
      const dimensions = await this.getImageDimensions(screenshot)
      const response = await analyzeScreenWithClaude(
        screenshot,
        goal,
        this.lastGuidance || undefined,
        dimensions || undefined
      )

      if (response.error) {
        console.error('AI error:', response.error)
        return
      }

      if (!response.text) {
        console.log('No response from AI')
        return
      }

      // Parse coordinates and target from response
      const parsed = parseCoordinatesFromResponse(response.text)
      console.log('Parsed response:', {
        hasTarget: !!parsed.target,
        target: parsed.target,
        hasCoordinates: !!parsed.coordinates,
        coordinates: parsed.coordinates,
        text: parsed.text
      })

      // Check for completion
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

      // Add AI response to chat
      const chatStore = useChatStore.getState()

      if (isComplete && this.currentGoal) {
        // Task completed
        chatStore.addMessage({
          role: 'assistant',
          content: trimmedResponse.startsWith('🎉') ? trimmedResponse : `🎉 ${trimmedResponse}`,
          screenshot
        })
        // Hide overlay and loading when task completes
        if (typeof window !== 'undefined') {
          if (window.electronAPI?.hideOverlay) {
            window.electronAPI.hideOverlay()
          }
          if (window.electronAPI?.hideLoadingIndicator) {
            await window.electronAPI.hideLoadingIndicator()
          }
        }
        this.currentGoal = null
        this.lastGuidance = null
        this.stopMonitoring()
        return
      } else {
        // Continue with next step
        chatStore.addMessage({
          role: 'assistant',
          content: parsed.text,
          screenshot
        })
        // Update last guidance for next click
        this.lastGuidance = parsed.text
      }

      // Resolve coordinates using hybrid approach (Accessibility API + AI fallback)
      const resolvedCoords = await this.resolveCoordinates(
        parsed.target,
        parsed.coordinates,
        screenshot
      )

      // Show highlight and speech bubble if we have coordinates
      if (resolvedCoords) {
        console.log('📊 [Click Handler] Showing highlight with coordinates:', resolvedCoords)
        await this.showHighlight(resolvedCoords, parsed.text)
      } else {
        console.log('📊 [Click Handler] No coordinates resolved - clearing highlights')
        // Hide loading if no coordinates
        if (typeof window !== 'undefined' && window.electronAPI?.hideLoadingIndicator) {
          await window.electronAPI.hideLoadingIndicator()
        }
        this.clearHighlights()
      }

      console.log('✅ Click event processed and AI response added to chat')
    } catch (error) {
      console.error('Error handling click event:', error)
      // Hide loading indicator on error
      if (typeof window !== 'undefined' && window.electronAPI?.hideLoadingIndicator) {
        await window.electronAPI.hideLoadingIndicator()
      }
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Start global click monitoring (always active, not tied to a task)
   */
  startGlobalClickMonitoring(): void {
    // Stop existing global monitoring if any
    this.stopGlobalClickMonitoring()

    if (typeof window !== 'undefined' && window.electronAPI?.startClickMonitoring) {
      window.electronAPI.startClickMonitoring().then((started: boolean) => {
        if (started) {
          console.log('✅ Global click monitoring started')

          // Set up click event listener
          const cleanup = window.electronAPI?.onMouseClick((event: { type: string; button: string; x: number; y: number; timestamp: number }) => {
            this.handleClickEvent(event)
          })

          this.globalClickMonitoringCleanup = cleanup
        } else {
          console.warn('⚠️ Failed to start global click monitoring')
        }
      }).catch((error: any) => {
        console.error('❌ Error starting global click monitoring:', error)
      })
    }
  }

  /**
   * Stop global click monitoring
   */
  stopGlobalClickMonitoring(): void {
    if (this.globalClickMonitoringCleanup) {
      this.globalClickMonitoringCleanup()
      this.globalClickMonitoringCleanup = null
    }

    if (typeof window !== 'undefined' && window.electronAPI?.stopClickMonitoring) {
      window.electronAPI.stopClickMonitoring()
    }
  }

  /**
   * Start background monitoring (for task-specific features like hotkey listener)
   * Note: Click monitoring is handled globally, not here
   */
  private startMonitoring() {
    this.stopMonitoring()
    this.setupHotkeyListener()

    // Click monitoring is handled globally via startGlobalClickMonitoring()
    // This method only sets up task-specific features like hotkey listeners

    console.log('Task monitoring started - Press Ctrl+Shift+Space for guidance')
  }

  /**
   * Stop monitoring (task-specific monitoring, not global)
   */
  stopMonitoring() {
    if (this.clickMonitoringCleanup) {
      this.clickMonitoringCleanup()
      this.clickMonitoringCleanup = null
    }
    if (this.hotkeyListenerCleanup) {
      this.hotkeyListenerCleanup()
      this.hotkeyListenerCleanup = null
    }

    // Note: Don't stop click monitoring process here - it's managed globally
    // Global click monitoring continues even when tasks are stopped
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
      const dimensions = await this.getImageDimensions(screenshot)
      const response = await analyzeScreenWithClaude(
        screenshot,
        this.currentGoal,
        this.lastGuidance || undefined,
        dimensions || undefined
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

        // Parse coordinates from response
        const parsed = parseCoordinatesFromResponse(response.text)

        if (isComplete) {
          chatStore.addMessage({
            role: 'assistant',
            content: `🎉 ${parsed.text}`,
            screenshot
          })
          // Hide overlay when task completes
          if (typeof window !== 'undefined' && window.electronAPI?.hideOverlay) {
            window.electronAPI.hideOverlay()
          }
          this.currentGoal = null
          this.stopMonitoring()
        } else {
          chatStore.addMessage({
            role: 'assistant',
            content: `💡 *Screen changed*\n\n${parsed.text}`,
            screenshot
          })
          this.lastGuidance = parsed.text

          // Resolve coordinates using hybrid approach
          const resolvedCoords = await this.resolveCoordinates(
            parsed.target,
            parsed.coordinates,
            screenshot
          )

          if (resolvedCoords) {
            await this.showHighlight(resolvedCoords)
          } else {
            this.clearHighlights()
          }
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
   * Note: Click monitoring continues running (it was started when user sent a message)
   */
  reset() {
    this.stopMonitoring()
    this.currentGoal = null
    this.lastGuidance = null
    this.lastScreenshot = null
    this.isProcessing = false
    useChatStore.getState().clearMessages()
    // Hide overlay on reset
    if (typeof window !== 'undefined' && window.electronAPI?.hideOverlay) {
      window.electronAPI.hideOverlay()
    }
    // Note: Click monitoring continues running - it will stop when app closes
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
