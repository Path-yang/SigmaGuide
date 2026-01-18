/**
 * Parse coordinates and target descriptions from AI response text
 * Supports:
 * 1. New format: {"target": {"text": "Button", "type": "button", "context": "dialog"}}
 * 2. Legacy format: {"coordinates": {"x": 100, "y": 200, "width": 80, "height": 30}}
 */

export interface ParsedCoordinates {
    x: number
    y: number
    width?: number
    height?: number
    coordinateSource?: 'accessibility' | 'ai'
}

export interface TargetDescription {
    text: string
    type?: string
    context?: string
}

export interface ParsedResponse {
    text: string
    coordinates?: ParsedCoordinates
    target?: TargetDescription
}

/**
 * Extract target description from AI response (new format)
 * Looks for: {"target": {"text": "Button", "type": "button", "context": "dialog"}}
 */
function parseTargetFromResponse(text: string): TargetDescription | null {
    // Try to find target JSON in the response
    const targetPatterns = [
        /\{"target"\s*:\s*\{([^}]+)\}\}/,
        /\{[^{}]*"target"\s*:\s*\{([^}]+)\}[^{}]*\}/
    ]

    for (const pattern of targetPatterns) {
        const match = text.match(pattern)
        if (match) {
            try {
                // Reconstruct and parse the target object
                const fullMatch = match[0]
                const parsed = JSON.parse(fullMatch)

                if (parsed.target && parsed.target.text) {
                    console.log('Parsed target:', parsed.target)
                    return {
                        text: parsed.target.text,
                        type: parsed.target.type,
                        context: parsed.target.context
                    }
                }
            } catch (e) {
                console.warn('Failed to parse target JSON:', e)

                // Try regex extraction for partial JSON
                const textMatch = match[0].match(/"text"\s*:\s*"([^"]+)"/)
                const typeMatch = match[0].match(/"type"\s*:\s*"([^"]+)"/)
                const contextMatch = match[0].match(/"context"\s*:\s*"([^"]+)"/)

                if (textMatch) {
                    return {
                        text: textMatch[1],
                        type: typeMatch ? typeMatch[1] : undefined,
                        context: contextMatch ? contextMatch[1] : undefined
                    }
                }
            }
        }
    }

    // Fallback: Look for quoted text that might be the target
    const quotedPatterns = [
        /(?:click|tap|select|press)\s+(?:the\s+)?['"]([^'"]+)['"]/i,
        /['"]([^'"]+)['"]\s+(?:button|link|menu|option|tab)/i
    ]

    for (const pattern of quotedPatterns) {
        const match = text.match(pattern)
        if (match) {
            console.log('Extracted target from text pattern:', match[1])
            return { text: match[1] }
        }
    }

    // Fallback: Infer menu bar targets from keyboard shortcuts
    // Command+Q typically means "Quit" menu item in app menu
    if (text.match(/Command\+Q|⌘\+Q|Cmd\+Q/i)) {
        // Try to extract app name from context
        const appNameMatch = text.match(/(?:quit|close)\s+(?:the\s+)?([A-Z][a-zA-Z]+)/i)
        if (appNameMatch) {
            const appName = appNameMatch[1]
            console.log('Inferred menu bar target from Command+Q:', appName)
            return {
                text: appName,
                type: 'menu',
                context: 'top menu bar'
            }
        }
        // If no app name found, look for "Quit" menu item
        if (text.match(/quit/i)) {
            console.log('Inferred "Quit" menu item from Command+Q')
            return {
                text: 'Quit',
                type: 'menu',
                context: 'app menu'
            }
        }
    }

    return null
}

/**
 * Extract coordinates from AI response (legacy format)
 * Looks for: {"coordinates": {"x": 100, "y": 200, "width": 80, "height": 30}}
 */
function parseLegacyCoordinates(text: string): ParsedCoordinates | null {
    // Try to find JSON in the response - look for coordinates pattern
    let jsonMatch = text.match(/\{[\s\S]*"coordinates"[\s\S]*\}/)

    // If no complete match, try to find incomplete JSON at the end
    if (!jsonMatch) {
        const partialMatch = text.match(/\{"coordinates"\s*:\s*\{[\s\S]*$/)
        if (partialMatch) {
            const coordsMatch = partialMatch[0].match(/"x"\s*:\s*(\d+)[,\s]*"y"\s*:\s*(\d+)(?:[,\s]*"width"\s*:\s*(\d+))?(?:[,\s]*"height"\s*:\s*(\d+))?/i)
            if (coordsMatch) {
                return {
                    x: parseInt(coordsMatch[1], 10),
                    y: parseInt(coordsMatch[2], 10),
                    width: coordsMatch[3] ? parseInt(coordsMatch[3], 10) : undefined,
                    height: coordsMatch[4] ? parseInt(coordsMatch[4], 10) : undefined
                }
            }
        }
    }

    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0])
            if (parsed.coordinates && typeof parsed.coordinates.x === 'number') {
                return {
                    x: parsed.coordinates.x,
                    y: parsed.coordinates.y,
                    width: parsed.coordinates.width,
                    height: parsed.coordinates.height
                }
            }
        } catch (e) {
            // Try regex extraction for invalid JSON
            const coordsMatch = jsonMatch[0].match(/"x"\s*:\s*(\d+)[,\s]*"y"\s*:\s*(\d+)(?:[,\s]*"width"\s*:\s*(\d+))?(?:[,\s]*"height"\s*:\s*(\d+))?/i)
            if (coordsMatch) {
                return {
                    x: parseInt(coordsMatch[1], 10),
                    y: parseInt(coordsMatch[2], 10),
                    width: coordsMatch[3] ? parseInt(coordsMatch[3], 10) : undefined,
                    height: coordsMatch[4] ? parseInt(coordsMatch[4], 10) : undefined
                }
            }
        }
    }

    // Try alternative format: coordinates: x=100, y=200
    const altMatch = text.match(/coordinates?[:\s]+x[=:\s]+(\d+)[,\s]+y[=:\s]+(\d+)(?:[,\s]+width[=:\s]+(\d+))?(?:[,\s]+height[=:\s]+(\d+))?/i)
    if (altMatch) {
        return {
            x: parseInt(altMatch[1], 10),
            y: parseInt(altMatch[2], 10),
            width: altMatch[3] ? parseInt(altMatch[3], 10) : undefined,
            height: altMatch[4] ? parseInt(altMatch[4], 10) : undefined
        }
    }

    return null
}

/**
 * Clean JSON from response text
 * Removes JSON objects containing "target" or "coordinates" from the text
 */
function cleanJsonFromText(text: string): string {
    let cleaned = text.trim()

    // Find JSON objects that contain "target" or "coordinates"
    // Look for the pattern: { ... "target" ... } or { ... "coordinates" ... }
    // We need to handle nested braces properly

    // Strategy: Find the last occurrence of a { before "target" or "coordinates"
    // and remove everything from there to the matching }

    const targetIndex = cleaned.lastIndexOf('"target"')
    const coordinatesIndex = cleaned.lastIndexOf('"coordinates"')
    const jsonStartIndex = Math.max(
        cleaned.lastIndexOf('{', targetIndex),
        cleaned.lastIndexOf('{', coordinatesIndex)
    )

    if (jsonStartIndex >= 0) {
        // Found a potential JSON start, find the matching closing brace
        let braceCount = 0
        let inString = false
        let escapeNext = false
        let jsonEndIndex = -1

        for (let i = jsonStartIndex; i < cleaned.length; i++) {
            const char = cleaned[i]

            if (escapeNext) {
                escapeNext = false
                continue
            }

            if (char === '\\') {
                escapeNext = true
                continue
            }

            if (char === '"' && !escapeNext) {
                inString = !inString
                continue
            }

            if (!inString) {
                if (char === '{') {
                    braceCount++
                } else if (char === '}') {
                    braceCount--
                    if (braceCount === 0) {
                        jsonEndIndex = i + 1
                        break
                    }
                }
            }
        }

        // If we found a complete JSON object, validate and remove it
        if (jsonEndIndex > jsonStartIndex) {
            const jsonCandidate = cleaned.substring(jsonStartIndex, jsonEndIndex)
            try {
                const parsed = JSON.parse(jsonCandidate)
                // Only remove if it contains target or coordinates
                if (parsed.target || parsed.coordinates) {
                    // Remove the JSON object and any leading/trailing whitespace
                    const before = cleaned.substring(0, jsonStartIndex).trim()
                    const after = cleaned.substring(jsonEndIndex).trim()
                    cleaned = (before + ' ' + after).trim()
                }
            } catch {
                // Not valid JSON, try regex fallback
                cleaned = cleaned.replace(/\{[^{}]*"(?:target|coordinates)"[^{}]*\}/g, '')
            }
        } else {
            // Couldn't find matching brace, try regex fallback
            cleaned = cleaned.replace(/\{[^{}]*"(?:target|coordinates)"[^{}]*\}/g, '')
        }
    }

    // Final cleanup: remove any remaining JSON-like patterns
    cleaned = cleaned
        .replace(/\s*\{[\s\S]*?"(?:target|coordinates)"[\s\S]*?\}\s*/g, '')
        .trim()

    // Remove empty JSON blocks and markdown code blocks
    cleaned = cleaned
        .replace(/```json\s*```/g, '') // Empty JSON code blocks
        .replace(/```\s*```/g, '') // Empty code blocks
        .replace(/```json\s*\{[\s\S]*?\}\s*```/g, '') // JSON in code blocks
        .replace(/```\s*\{[\s\S]*?\}\s*```/g, '') // JSON in code blocks without json tag
        .replace(/\{\s*\}/g, '') // Empty JSON objects
        .trim()

    return cleaned
}

/**
 * Parse AI response for target description and/or coordinates
 * New format can have both: {"target": {...}, "coordinates": {...}}
 */
export function parseCoordinatesFromResponse(responseText: string): ParsedResponse {
    const text = responseText.trim()

    console.log('Parsing response, length:', text.length)
    console.log('Response preview:', text.substring(0, 200))

    // Try to find any JSON object in the response (more flexible)
    const jsonPatterns = [
        // Combined format
        /\{[\s\S]*"target"[\s\S]*"coordinates"[\s\S]*\}/,
        /\{[\s\S]*"coordinates"[\s\S]*"target"[\s\S]*\}/,
        // Standalone target
        /\{"target"\s*:\s*\{[^}]+\}\}/,
        /\{[^{}]*"target"[^{}]*\}/,
        // Standalone coordinates
        /\{"coordinates"\s*:\s*\{[^}]+\}\}/,
        /\{[^{}]*"coordinates"[^{}]*\}/
    ]

    for (const pattern of jsonPatterns) {
        const match = text.match(pattern)
        if (match) {
            console.log('Found JSON pattern match:', match[0].substring(0, 150))
            try {
                // Try to parse as-is
                let parsed = JSON.parse(match[0])

                // If that fails, try to fix common issues
                if (!parsed) {
                    // Try fixing single quotes
                    const fixed = match[0].replace(/'/g, '"')
                    parsed = JSON.parse(fixed)
                }

                // Remove the matched JSON from the text explicitly
                let cleanedText = text
                const matchIndex = text.indexOf(match[0])
                if (matchIndex >= 0) {
                    // Remove the JSON match and any surrounding whitespace
                    const before = text.substring(0, matchIndex).trim()
                    const after = text.substring(matchIndex + match[0].length).trim()
                    cleanedText = (before + ' ' + after).trim()
                } else {
                    // Fallback to cleanJsonFromText if indexOf fails
                    cleanedText = cleanJsonFromText(text)
                }

                // Additional cleanup for empty JSON blocks and markdown
                cleanedText = cleanedText
                    .replace(/```json\s*```/g, '') // Empty JSON code blocks
                    .replace(/```\s*```/g, '') // Empty code blocks
                    .replace(/```json\s*\{[\s\S]*?\}\s*```/g, '') // JSON in code blocks
                    .replace(/```\s*\{[\s\S]*?\}\s*```/g, '') // JSON in code blocks without json tag
                    .replace(/\{\s*\}/g, '') // Empty JSON objects
                    .replace(/^\s*```\s*$/gm, '') // Standalone code block markers
                    .trim()

                const result: ParsedResponse = {
                    text: cleanedText || text.trim()
                }

                if (parsed.target && parsed.target.text) {
                    result.target = {
                        text: parsed.target.text,
                        type: parsed.target.type,
                        context: parsed.target.context
                    }
                    console.log('Extracted target:', result.target)
                }

                if (parsed.coordinates && typeof parsed.coordinates.x === 'number') {
                    result.coordinates = {
                        x: parsed.coordinates.x,
                        y: parsed.coordinates.y,
                        width: parsed.coordinates.width,
                        height: parsed.coordinates.height
                    }
                    console.log('Extracted coordinates:', result.coordinates)
                }

                if (result.target || result.coordinates) {
                    console.log('Successfully parsed:', { hasTarget: !!result.target, hasCoordinates: !!result.coordinates })
                    return result
                }
            } catch (e) {
                console.warn('Failed to parse JSON:', e, 'Attempted to parse:', match[0].substring(0, 100))
                // Try regex extraction as fallback
                const coordsMatch = match[0].match(/"x"\s*:\s*(\d+)[,\s]*"y"\s*:\s*(\d+)(?:[,\s]*"width"\s*:\s*(\d+))?(?:[,\s]*"height"\s*:\s*(\d+))?/i)
                if (coordsMatch) {
                    console.log('Extracted coordinates via regex fallback')
                    // Remove the matched JSON from text
                    let cleanedText = text
                    const matchIndex = text.indexOf(match[0])
                    if (matchIndex >= 0) {
                        const before = text.substring(0, matchIndex).trim()
                        const after = text.substring(matchIndex + match[0].length).trim()
                        cleanedText = (before + ' ' + after).trim()
                    } else {
                        cleanedText = cleanJsonFromText(text)
                    }
                    
                    // Additional cleanup
                    cleanedText = cleanedText
                        .replace(/```json\s*```/g, '')
                        .replace(/```\s*```/g, '')
                        .replace(/```json\s*\{[\s\S]*?\}\s*```/g, '')
                        .replace(/```\s*\{[\s\S]*?\}\s*```/g, '')
                        .replace(/\{\s*\}/g, '')
                        .replace(/^\s*```\s*$/gm, '')
                        .trim()
                    
                    return {
                        text: cleanedText || text.trim(),
                        coordinates: {
                            x: parseInt(coordsMatch[1], 10),
                            y: parseInt(coordsMatch[2], 10),
                            width: coordsMatch[3] ? parseInt(coordsMatch[3], 10) : undefined,
                            height: coordsMatch[4] ? parseInt(coordsMatch[4], 10) : undefined
                        }
                    }
                }
            }
        }
    }

    // Try to find target description (new format)
    const target = parseTargetFromResponse(text)
    const coordinates = parseLegacyCoordinates(text)

    if (target || coordinates) {
        console.log('Found separate format:', { hasTarget: !!target, hasCoordinates: !!coordinates })
        let cleaned = cleanJsonFromText(text) || text
        // Additional cleanup
        cleaned = cleaned
            .replace(/```json\s*```/g, '')
            .replace(/```\s*```/g, '')
            .replace(/```json\s*\{[\s\S]*?\}\s*```/g, '')
            .replace(/```\s*\{[\s\S]*?\}\s*```/g, '')
            .replace(/\{\s*\}/g, '')
            .replace(/^\s*```\s*$/gm, '')
            .trim()
        return {
            text: cleaned,
            target: target || undefined,
            coordinates: coordinates || undefined
        }
    }

    console.log('No target or coordinates found in response')
    // Clean up any remaining JSON even if we didn't parse it
    let finalText = text
        .replace(/```json\s*```/g, '')
        .replace(/```\s*```/g, '')
        .replace(/```json\s*\{[\s\S]*?\}\s*```/g, '')
        .replace(/```\s*\{[\s\S]*?\}\s*```/g, '')
        .replace(/\{\s*\}/g, '')
        .replace(/^\s*```\s*$/gm, '')
        .trim()
    return { text: finalText }
}
