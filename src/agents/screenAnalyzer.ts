import { analyzeScreenshot, analyzeScreenshotWithMultipleImages, parseJsonResponse } from '../lib/openai'
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
  beforeScreenshot: string,
  afterScreenshot: string,
  instruction: string
): Promise<StepVerification | null> {
  // Use the formatted prompt from prompts.ts with the instruction
  const prompt = PROMPTS.stepVerification.replace('{instruction}', instruction)
  
  // Send BOTH screenshots for comparison
  // GPT-4o supports multiple images in a single message
  const response = await analyzeScreenshotWithMultipleImages(
    [beforeScreenshot, afterScreenshot],
    prompt,
    ['BEFORE screenshot - state before the action', 'AFTER screenshot - current state']
  )
  
  if (response.error) {
    console.error('Step verification failed:', response.error)
    return null
  }

  return parseJsonResponse<StepVerification>(response.text)
}

