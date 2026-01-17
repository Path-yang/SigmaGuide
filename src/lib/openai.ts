import OpenAI from 'openai'

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY

if (!API_KEY) {
  console.warn('⚠️ VITE_OPENAI_API_KEY not set. Add it to .env file.')
}

const openai = new OpenAI({
  apiKey: API_KEY || '',
  dangerouslyAllowBrowser: true // Required for client-side usage in Electron
})

export interface AIResponse {
  text: string
  error?: string
}

/**
 * Analyze a screenshot with a text prompt using GPT-4 Vision
 */
export async function analyzeScreenshot(
  base64Image: string, 
  prompt: string
): Promise<AIResponse> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: base64Image,
                detail: 'high'
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ],
      max_tokens: 4096
    })

    const text = response.choices[0]?.message?.content || ''
    return { text }
  } catch (error) {
    console.error('OpenAI Vision error:', error)
    return { 
      text: '', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

/**
 * Generate text response (no image)
 */
export async function generateText(prompt: string): Promise<AIResponse> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 4096
    })

    const text = response.choices[0]?.message?.content || ''
    return { text }
  } catch (error) {
    console.error('OpenAI Text error:', error)
    return { 
      text: '', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

/**
 * Parse JSON from AI response (handles markdown code blocks)
 */
export function parseJsonResponse<T>(text: string): T | null {
  try {
    // Remove markdown code blocks if present
    let cleaned = text.trim()
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7)
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3)
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3)
    }
    return JSON.parse(cleaned.trim()) as T
  } catch (error) {
    console.error('JSON parse error:', error)
    return null
  }
}






