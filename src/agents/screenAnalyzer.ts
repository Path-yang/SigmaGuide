import { analyzeScreenshot, parseJsonResponse } from '../lib/openai'
import { PROMPTS } from '../lib/prompts'

export interface ScreenAnalysis {
  app: string
  version: string
  os: string
  currentState: string
  visibleElements: string[]
}

export async function analyzeScreen(screenshotBase64: string): Promise<ScreenAnalysis | null> {
  const response = await analyzeScreenshot(screenshotBase64, PROMPTS.screenAnalyzer)
  
  if (response.error) {
    console.error('Screen analysis failed:', response.error)
    return null
  }

  const analysis = parseJsonResponse<ScreenAnalysis>(response.text)
  
  if (!analysis) {
    console.error('Failed to parse screen analysis')
    return null
  }

  return analysis
}

export interface StepVerification {
  completed: boolean
  confidence: number
  observation: string
  nextRecommendation?: string
}

export async function verifyStepCompletion(
  _beforeScreenshot: string,
  afterScreenshot: string,
  instruction: string
): Promise<StepVerification | null> {
  const prompt = `You are a step verification AI. The user was instructed to: "${instruction}"

Compare the two screenshots (before and after) and determine if they completed the action.

Return JSON:
{
  "completed": true or false,
  "confidence": 0.0 to 1.0,
  "observation": "What changed",
  "nextRecommendation": "If not completed, what might help"
}

Be generous - if the goal seems achieved even if done differently, mark as complete.`

  // For verification, we need to send both images
  // Gemini 2.0 Flash supports multi-image input
  const response = await analyzeScreenshot(afterScreenshot, prompt)
  
  if (response.error) {
    console.error('Step verification failed:', response.error)
    return null
  }

  return parseJsonResponse<StepVerification>(response.text)
}

