import { analyzeScreenshot, parseJsonResponse } from '../lib/openai'
import { PROMPTS } from '../lib/prompts'
import { ScreenAnalysis } from './screenAnalyzer'
import { TaskStep } from '../stores/taskStore'

export interface DecomposedTask {
  steps: {
    instruction: string
    uiElement: string
    action: string
  }[]
}

export async function decomposeTask(
  userGoal: string,
  screenAnalysis: ScreenAnalysis,
  screenshotBase64: string
): Promise<TaskStep[] | null> {
  const contextPrompt = `${PROMPTS.taskDecomposer}

Current Application Context:
- App: ${screenAnalysis.app}
- Version: ${screenAnalysis.version}
- OS: ${screenAnalysis.os}
- Current State: ${screenAnalysis.currentState}
- Visible Elements: ${screenAnalysis.visibleElements.join(', ')}

User's Goal: "${userGoal}"

Analyze the screenshot and create step-by-step instructions to achieve this goal.`

  const response = await analyzeScreenshot(screenshotBase64, contextPrompt)
  
  if (response.error) {
    console.error('Task decomposition failed:', response.error)
    return null
  }

  const decomposed = parseJsonResponse<DecomposedTask>(response.text)
  
  if (!decomposed || !decomposed.steps) {
    console.error('Failed to parse decomposed task')
    return null
  }

  // Convert to TaskStep format
  return decomposed.steps.map((step, index) => ({
    id: `step-${index + 1}`,
    instruction: step.instruction,
    completed: false,
    uiElement: step.uiElement,
    action: step.action
  }))
}

