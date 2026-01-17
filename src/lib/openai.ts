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
      model: 'gpt-4o', // Use gpt-4o for accurate image analysis
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: base64Image,
                detail: 'high' // High detail for better UI element recognition
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ],
      max_tokens: 500, // Limit output for faster response
      temperature: 0.1 // Lower temperature for more accurate outputs
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
 * Analyze multiple screenshots with a text prompt using GPT-4 Vision
 * This is essential for comparing before/after screenshots for step verification
 */
export async function analyzeScreenshotWithMultipleImages(
  base64Images: string[], 
  prompt: string,
  imageLabels?: string[]
): Promise<AIResponse> {
  try {
    const imageContent = base64Images.map((img) => ({
      type: 'image_url' as const,
      image_url: {
        url: img,
        detail: 'low' as const // 85 tokens vs 1105 tokens per image
      }
    }))

    // Add labels to prompt if provided
    let enhancedPrompt = prompt
    if (imageLabels && imageLabels.length === base64Images.length) {
      const labelText = imageLabels
        .map((label, idx) => `Image ${idx + 1}: ${label}`)
        .join('\n')
      enhancedPrompt = `${labelText}\n\n${prompt}`
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Use gpt-4o for accurate image comparison
      messages: [
        {
          role: 'user',
          content: [
            ...imageContent,
            {
              type: 'text' as const,
              text: enhancedPrompt
            }
          ]
        }
      ],
      max_tokens: 500, // Limit output for faster response
      temperature: 0.1 // Lower temperature for more deterministic JSON output
    })

    const text = response.choices[0]?.message?.content || ''
    return { text }
  } catch (error) {
    console.error('OpenAI Vision multi-image error:', error)
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
      model: 'gpt-4o-mini', // Faster than gpt-4o
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 500, // Limit output for faster response
      temperature: 0.3 // Slightly higher for natural language
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






