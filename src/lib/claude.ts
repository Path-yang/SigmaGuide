import OpenAI from 'openai'

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY

if (!API_KEY) {
  console.warn('⚠️ VITE_OPENAI_API_KEY not set. Add it to .env file.')
}

const openai = new OpenAI({
  apiKey: API_KEY || '',
  dangerouslyAllowBrowser: true
})

export interface ClaudeResponse {
  text: string
  error?: string
}

/**
 * Analyze screenshot and provide guidance using OpenAI's vision
 * GPT-4 Vision is excellent for UI understanding and computer use
 */
export async function analyzeScreenWithClaude(
  base64Image: string,
  userGoal: string,
  previousAction?: string,
  imageDimensions?: { width: number; height: number }
): Promise<ClaudeResponse> {
  try {
    // OpenAI accepts data URLs directly, but we can also use base64
    // Ensure it's a proper data URL format
    const imageUrl = base64Image.startsWith('data:')
      ? base64Image
      : `data:image/png;base64,${base64Image}`

    // Get image dimensions if not provided
    let dimensionsInfo = ''
    if (imageDimensions) {
      dimensionsInfo = `\n\nIMPORTANT: The screenshot dimensions are ${imageDimensions.width}x${imageDimensions.height} pixels.
When providing coordinates, use this coordinate system:
- Top-left corner is (0, 0)
- Bottom-right corner is (${imageDimensions.width}, ${imageDimensions.height})
- x increases from left to right
- y increases from top to bottom`
    }

    // Precise system prompt for elite accuracy with semantic targeting
    const systemPrompt = `You are an expert screen reader guiding users through software tasks with crystal-clear, actionable steps.

INTERNAL THINKING PROCESS (do not include in your response):
1. OBSERVE: Carefully examine the screenshot. What application/terminal is shown? What is the CURRENT state?
2. CHECK COMPLETION: Look for these completion indicators:
   - Success messages: "Successfully created", "Done", "Completed", "Created", "Installed"
   - Terminal prompts returned to normal (no command running)
   - Confirmation dialogs showing success
   - The requested item now EXISTS (e.g., new file visible, new environment listed)

OUTPUT FORMAT (this is what you should write):
- If goal is ACHIEVED → Start with "Done!" and explain what was accomplished
- If goal is NOT achieved → Provide ONLY ONE clear, actionable step using this format:

FORMAT FOR ACTIONABLE STEPS:
1. Start with an ACTION VERB (Click, Type, Press, Select, Navigate to, etc.)
2. Specify the EXACT location (menu name, button text, tab name, etc.)
3. Include WHERE to find it (top menu bar, left sidebar, dialog box, etc.)
4. Optionally mention what should happen next

EXAMPLES OF GOOD ACTIONABLE STEPS:
✅ "Click the 'File' menu in the top menu bar, then select 'New' from the dropdown."
✅ "Type your password into the 'Password' field in the login dialog box."
✅ "Press the 'Save' button in the bottom-right corner of the dialog."
✅ "Select the 'Settings' tab at the top of the window."
✅ "Navigate to the 'View' menu in the top menu bar, then click 'Freeze Panes'."

AVOID VAGUE INSTRUCTIONS:
❌ "Go to settings" → ✅ "Click 'Settings' in the top menu bar"
❌ "Create a new file" → ✅ "Click 'File' in the menu bar, then select 'New'"
❌ "Enter your name" → ✅ "Type your name into the 'Name' input field at the top of the form"

TARGET IDENTIFICATION:
When identifying a click target (button, menu item, link, etc.), provide target info in JSON format at the end of your response:
{"target": {"text": "Button Text", "type": "button", "context": "dialog or section name"}, "coordinates": {"x": 100, "y": 200, "width": 80, "height": 30}}

- target.text: The EXACT visible text label on the element (REQUIRED - must match what you see on screen)
- target.type: Element type (button, link, menu, tab, input, checkbox, icon, etc.)
- target.context: Where on screen this element is located (e.g., "confirmation dialog", "top menu bar", "settings panel")
- coordinates: Provide pixel coordinates (x, y = center of the button/element, width/height = size of the element in pixels)
- Screenshot dimensions: Match screen logical dimensions (coordinates map 1:1 to screen coordinates)
- IMPORTANT: x and y should be the CENTER point of the clickable element, not the top-left corner

IMPORTANT:
- The "text" field must be the EXACT text visible on the element - this is used for precise matching
- For icons without text, describe what the icon looks like: {"target": {"text": "X close icon", "type": "icon", "context": "top right corner"}}
- Always provide BOTH target description AND coordinates for best accuracy
- ALWAYS provide target JSON if there's ANY UI element that can be clicked, even if a keyboard shortcut exists
- For menu bar actions (like quitting an app), identify the menu item: {"target": {"text": "Quit", "type": "menu", "context": "app name menu"}} or {"target": {"text": "AppName", "type": "menu", "context": "top menu bar"}}
- If you mention a keyboard shortcut (like Command+Q), ALSO identify the corresponding menu item that can be clicked
- DO NOT include empty JSON objects like {} or empty code blocks in your response
- DO NOT wrap the JSON in markdown code blocks - just include it as plain JSON at the end

ACCURACY RULES:
- READ any visible text carefully - especially terminal output, status messages, notifications
- If you see SUCCESS indicators for the goal, say "Done!" 
- If a command is STILL RUNNING (spinner, progress bar, "loading"), say "Wait for it to complete"
- Be SPECIFIC: name exact buttons, menu items, commands you see
- Each step should be ONE clear action that the user can immediately execute
- Use numbered steps if multiple actions are needed, but keep it to ONE step per response
- Max 3 sentences + target JSON

CRITICAL: Only output the actionable step itself. Do NOT include "STEP 1", "STEP 2", "STEP 3" or any reasoning process in your response. Just provide the direct instruction.`

    const userPrompt = previousAction
      ? `GOAL: "${userGoal}"
PREVIOUS INSTRUCTION: "${previousAction}"${dimensionsInfo}

First, check: Is the goal "${userGoal}" now COMPLETE based on what you see?
- If YES (you see success message, task finished, item created) → say "Done! [what was achieved]"
- If NO → Provide ONE clear, actionable step. Use this format:
  1. Start with an action verb (Click, Type, Press, Select, etc.)
  2. Specify the exact element name and location
  3. Mention where to find it on screen
  
Example: "Click the 'Save' button in the bottom-right corner of the dialog box."`
      : `GOAL: "${userGoal}"${dimensionsInfo}

Look at the screen. Provide ONE clear, actionable step to start achieving this goal.

Use this format:
1. Start with an action verb (Click, Type, Press, Select, Navigate to, etc.)
2. Specify the exact element name and location
3. Mention where to find it on screen

Example: "Click the 'File' menu in the top menu bar, then select 'New' from the dropdown."`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // GPT-4o for excellent vision capabilities
      max_tokens: 400,
      temperature: 0.1, // Lower temperature for more accurate outputs
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'high' // High detail for better UI element recognition
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

    const text = response.choices[0]?.message?.content || ''

    return { text }
  } catch (error) {
    console.error('OpenAI error:', error)
    return {
      text: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Fast intent classification using GPT-4o-mini (fast and efficient)
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
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Fast and efficient for classification
      max_tokens: 80,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: `Is this a software help request? "${userMessage}"
Reply JSON: {"isTask": true/false, "task": "task description if true"}`
        }
      ]
    })

    const text = response.choices[0]?.message?.content || '{}'

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
    console.error('OpenAI classify error:', error)
    return { isTask: true, task: userMessage }
  }
}

/**
 * Quick single answer - just answer the question directly without task tracking
 * Used in "single" guidance mode
 */
export async function quickAnswerClaude(
  base64Image: string,
  question: string
): Promise<ClaudeResponse> {
  try {
    // OpenAI accepts data URLs directly
    const imageUrl = base64Image.startsWith('data:')
      ? base64Image
      : `data:image/png;base64,${base64Image}`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 300,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'high'
              }
            },
            {
              type: 'text',
              text: `Looking at this screen, answer this question with clear, actionable steps: "${question}"

Provide step-by-step instructions using this format:
1. Start each step with an action verb (Click, Type, Press, Select, etc.)
2. Specify the exact element name and where to find it
3. Be specific about locations (menu bar, dialog, sidebar, etc.)

Example format:
"1. Click the 'File' menu in the top menu bar.
2. Select 'New' from the dropdown menu.
3. Choose 'Document' from the submenu."

Be direct, helpful, and make each step immediately actionable.`
            }
          ]
        }
      ]
    })

    const text = response.choices[0]?.message?.content || ''

    return { text }
  } catch (error) {
    console.error('OpenAI quick answer error:', error)
    return {
      text: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}