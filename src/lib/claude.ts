import Anthropic from '@anthropic-ai/sdk'

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY

if (!API_KEY) {
  console.warn('⚠️ VITE_ANTHROPIC_API_KEY not set. Add it to .env file.')
}

const anthropic = new Anthropic({
  apiKey: API_KEY || '',
  dangerouslyAllowBrowser: true
})

export interface ClaudeResponse {
  text: string
  error?: string
}

/**
 * Analyze screenshot and provide guidance using Claude's vision
 * Claude is specifically designed for computer use and UI understanding
 */
export async function analyzeScreenWithClaude(
  base64Image: string,
  userGoal: string,
  previousAction?: string
): Promise<ClaudeResponse> {
  try {
    // Remove data URL prefix if present
    const imageData = base64Image.replace(/^data:image\/\w+;base64,/, '')
    
    // Precise system prompt for elite accuracy
    const systemPrompt = `You are an expert screen reader guiding users through software tasks.

STEP 1 - OBSERVE: Carefully examine the screenshot. What application/terminal is shown? What is the CURRENT state?

STEP 2 - CHECK COMPLETION: Look for these completion indicators:
- Success messages: "Successfully created", "Done", "Completed", "Created", "Installed"
- Terminal prompts returned to normal (no command running)
- Confirmation dialogs showing success
- The requested item now EXISTS (e.g., new file visible, new environment listed)

STEP 3 - RESPOND:
- If goal is ACHIEVED → Start with "Done!" and explain what was accomplished
- If goal is NOT achieved → Give ONE specific next action

ACCURACY RULES:
- READ any visible text carefully - especially terminal output, status messages, notifications
- If you see SUCCESS indicators for the goal, say "Done!" 
- If a command is STILL RUNNING (spinner, progress bar, "loading"), say "Wait for it to complete"
- Be SPECIFIC: name exact buttons, menu items, commands you see
- Max 2 sentences`

    const userPrompt = previousAction 
      ? `GOAL: "${userGoal}"
PREVIOUS INSTRUCTION: "${previousAction}"

First, check: Is the goal "${userGoal}" now COMPLETE based on what you see?
- If YES (you see success message, task finished, item created) → say "Done! [what was achieved]"
- If NO → What is the ONE next action?`
      : `GOAL: "${userGoal}"

Look at the screen. What is the ONE action to start achieving this goal?`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150, // Reduced for faster response
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: imageData
              }
            },
            {
              type: 'text',
              text: userPrompt
            }
          ]
        }
      ]
    })

    const textContent = response.content.find(c => c.type === 'text')
    const text = textContent && 'text' in textContent ? textContent.text : ''
    
    return { text }
  } catch (error) {
    console.error('Claude error:', error)
    return {
      text: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Fast intent classification using Haiku (much faster than Sonnet)
 */
export async function classifyIntentClaude(
  userMessage: string
): Promise<{ isTask: boolean; task: string }> {
  // Quick local check for obvious greetings (no API call needed)
  const lower = userMessage.toLowerCase().trim()
  if (['hi', 'hello', 'hey', 'thanks', 'thank you', 'bye', 'ok', 'okay'].includes(lower)) {
    return { isTask: false, task: '' }
  }
  
  // If message is long enough and contains task-like words, assume it's a task
  if (userMessage.length > 10 && 
      (lower.includes('how') || lower.includes('help') || lower.includes('want') || 
       lower.includes('need') || lower.includes('show') || lower.includes('teach'))) {
    return { isTask: true, task: userMessage }
  }
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022', // Much faster than Sonnet
      max_tokens: 80,
      messages: [
        {
          role: 'user',
          content: `Is this a software help request? "${userMessage}"
Reply JSON: {"isTask": true/false, "task": "task description if true"}`
        }
      ]
    })

    const textContent = response.content.find(c => c.type === 'text')
    const text = textContent && 'text' in textContent ? textContent.text : '{}'
    
    try {
      const parsed = JSON.parse(text)
      return {
        isTask: parsed.isTask || false,
        task: parsed.task || userMessage
      }
    } catch {
      return { isTask: true, task: userMessage }
    }
  } catch (error) {
    console.error('Claude classify error:', error)
    return { isTask: true, task: userMessage }
  }
}
