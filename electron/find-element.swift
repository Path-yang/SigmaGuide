#!/usr/bin/env swift

import Cocoa
import ApplicationServices

// Get arguments: text, type (optional), context (optional), appName (optional)
// When run via "swift script.swift arg1", CommandLine.arguments is: ["swift", "script.swift", "arg1", ...]
// When run directly (shebang), CommandLine.arguments is: ["script.swift", "arg1", ...]
// So we drop first 2 if second arg contains ".swift", otherwise drop first 1
let allArgs = Array(CommandLine.arguments)
let scriptArgs: [String]
if allArgs.count > 1 && allArgs[1].hasSuffix(".swift") {
    // Running via "swift script.swift" - drop "swift" and script path
    scriptArgs = Array(allArgs.dropFirst(2))
} else {
    // Running directly - drop script path only
    scriptArgs = Array(allArgs.dropFirst())
}

guard scriptArgs.count >= 1 else {
    print("ERROR: Missing required argument: text")
    exit(1)
}

let targetText = scriptArgs[0]
let targetType = scriptArgs.count > 1 ? scriptArgs[1] : nil
let targetContext = scriptArgs.count > 2 ? scriptArgs[2] : nil
let targetAppName = scriptArgs.count > 3 ? scriptArgs[3] : nil

// Check if Accessibility permissions are granted
guard AXIsProcessTrusted() else {
    print("ERROR: Accessibility permissions not granted. Please enable in System Settings > Privacy & Security > Accessibility")
    exit(1)
}

// Function to find app by name
func findAppByName(_ appName: String) -> NSRunningApplication? {
    let workspace = NSWorkspace.shared
    let runningApps = workspace.runningApplications
    
    // Normalize app name for comparison (remove .app extension, case insensitive)
    let normalizedTarget = appName.lowercased().replacingOccurrences(of: ".app", with: "")
    
    // First pass: Try exact matches (preferred)
    for app in runningApps {
        if let localizedName = app.localizedName {
            let normalizedAppName = localizedName.lowercased().replacingOccurrences(of: ".app", with: "")
            // Exact match is preferred
            if normalizedAppName == normalizedTarget {
                FileHandle.standardError.write(Data("Exact match found: '\(localizedName)'\n".utf8))
                return app
            }
        }
        // Also check bundle identifier for exact match
        if let bundleId = app.bundleIdentifier {
            let normalizedBundleId = bundleId.lowercased()
            // Check if bundle ID ends with the app name (e.g., com.todesktop.230313mzl4w4u92 -> cursor)
            if normalizedBundleId.hasSuffix("." + normalizedTarget) || normalizedBundleId == normalizedTarget {
                FileHandle.standardError.write(Data("Exact bundle ID match found: '\(bundleId)'\n".utf8))
                return app
            }
        }
    }
    
    // Second pass: Try partial matches, but exclude helper processes
    let excludedSuffixes = ["uiviewservice", "helper", "agent", "service", "daemon", "background"]
    for app in runningApps {
        if let localizedName = app.localizedName {
            let normalizedAppName = localizedName.lowercased().replacingOccurrences(of: ".app", with: "")
            
            // Skip helper processes
            var isHelper = false
            for suffix in excludedSuffixes {
                if normalizedAppName.contains(suffix) {
                    isHelper = true
                    break
                }
            }
            if isHelper {
                continue
            }
            
            // Check if app name starts with target (e.g., "Cursor" matches "Cursor" but not "CursorUIViewService")
            if normalizedAppName.hasPrefix(normalizedTarget) && normalizedAppName.count <= normalizedTarget.count + 5 {
                // Allow small variations (like "Cursor" vs "Cursor.app")
                FileHandle.standardError.write(Data("Prefix match found: '\(localizedName)'\n".utf8))
                return app
            }
        }
    }
    
    return nil
}

// Determine which app to search in
var targetApp: NSRunningApplication?

if let appName = targetAppName, !appName.isEmpty {
    FileHandle.standardError.write(Data("Looking for target app: '\(appName)'\n".utf8))
    targetApp = findAppByName(appName)
    
    if let foundApp = targetApp {
        FileHandle.standardError.write(Data("✓ Found target app: \(foundApp.localizedName ?? "Unknown")\n".utf8))
    } else {
        FileHandle.standardError.write(Data("✗ Target app '\(appName)' not found, falling back to frontmost app\n".utf8))
    }
}

// Fallback to frontmost app if target app not specified or not found
if targetApp == nil {
    guard let frontmostApp = NSWorkspace.shared.frontmostApplication else {
        print("ERROR: Could not get frontmost application")
        exit(1)
    }
    targetApp = frontmostApp
}

guard let app = targetApp else {
    print("ERROR: Could not determine target application")
    exit(1)
}

let pid = app.processIdentifier
// Debug info to stderr (won't interfere with JSON output)
FileHandle.standardError.write(Data("=== Accessibility API Search ===\n".utf8))
FileHandle.standardError.write(Data("Searching in app: \(app.localizedName ?? "Unknown") (PID: \(pid))\n".utf8))
FileHandle.standardError.write(Data("Target: text='\(targetText)', type='\(targetType ?? "any")', context='\(targetContext ?? "none")'\n".utf8))
if let appName = targetAppName {
    FileHandle.standardError.write(Data("Target app name: '\(appName)'\n".utf8))
}

// Create accessibility element for the application
let appElement = AXUIElementCreateApplication(pid)

// Map target type to AXRole
func mapTypeToAXRole(_ type: String?) -> String? {
    guard let type = type else { return nil }
    let lowerType = type.lowercased()
    switch lowerType {
    case "button": return kAXButtonRole
    case "menu", "menuitem": return kAXMenuItemRole
    case "menubaritem", "menu bar item": return kAXMenuBarItemRole
    case "checkbox": return kAXCheckBoxRole
    case "radio", "radiobutton": return kAXRadioButtonRole
    case "textfield", "input": return kAXTextFieldRole
    case "window": return kAXWindowRole
    default: return nil
    }
}

let targetRole = mapTypeToAXRole(targetType)
if let role = targetRole {
    FileHandle.standardError.write(Data("Mapped role: '\(targetType ?? "nil")' -> '\(role)'\n".utf8))
} else if targetType != nil {
    FileHandle.standardError.write(Data("Warning: Unknown role type '\(targetType!)', will search without role filter\n".utf8))
}

// Helper function to get element info for debugging
func getElementInfo(_ element: AXUIElement) -> String {
    var info = ""
    var roleValue: CFTypeRef?
    var titleValue: CFTypeRef?
    if AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &roleValue) == .success,
       let role = roleValue as? String {
        info += "role=\(role)"
    }
    if AXUIElementCopyAttributeValue(element, kAXTitleAttribute as CFString, &titleValue) == .success,
       let title = titleValue as? String {
        if !info.isEmpty { info += ", " }
        info += "title='\(title)'"
    }
    return info.isEmpty ? "unknown" : info
}

// Recursively search for element matching criteria
// Returns: (exactMatch, partialMatch) - prefers exact matches over partial matches
// CRITICAL: Always searches children first to avoid matching parent containers
func searchElementTree(_ element: AXUIElement, role: String?, title: String, depth: Int = 0, maxDepth: Int = 20) -> (exact: AXUIElement?, partial: AXUIElement?) {
    // Prevent infinite recursion
    if depth > maxDepth {
        return (nil, nil)
    }
    
    // STEP 1: Search children FIRST (before checking current element)
    // This ensures we find the most specific match, not a parent container
    var childrenValue: CFTypeRef?
    let childrenErr = AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &childrenValue)
    
    var childExactMatch: AXUIElement? = nil
    var childPartialMatch: AXUIElement? = nil
    var hasChildren = false
    
    if childrenErr == .success, let children = childrenValue as? [AXUIElement], !children.isEmpty {
        hasChildren = true
        // Log menu bar structure for debugging (only at top level for menu bar searches)
        if depth == 0 && role == nil {
            FileHandle.standardError.write(Data("Searching \(children.count) children of \(getElementInfo(element))\n".utf8))
        }
        for child in children {
            let (childExact, childPartial) = searchElementTree(child, role: role, title: title, depth: depth + 1, maxDepth: maxDepth)
            // Collect matches from children (prefer exact over partial)
            if childExact != nil {
                childExactMatch = childExact
                // If we found an exact match in children, ignore partial matches
                childPartialMatch = nil
                // Once we find an exact match, we can stop searching (but continue to be thorough)
            } else if childPartial != nil && childExactMatch == nil {
                // Only keep child partial match if we don't have an exact match from children
                // Prefer the FIRST partial match we find (depth-first search ensures it's from a deeper level)
                if childPartialMatch == nil {
                    childPartialMatch = childPartial
                }
            }
        }
    } else if depth == 0 {
        FileHandle.standardError.write(Data("Warning: Could not get children of element\n".utf8))
    }
    
    // STEP 2: If we found an exact match in children, return it immediately
    if childExactMatch != nil {
        return (childExactMatch, nil)
    }
    
    // STEP 3: Check current element for matches (we'll compare with child partial matches later)
    var exactMatch: AXUIElement? = nil
    var partialMatch: AXUIElement? = nil
    
    // Get element role
    var roleValue: CFTypeRef?
    let roleErr = AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &roleValue)
    
    if roleErr == .success, let roleStr = roleValue as? String {
        // Check if role matches (if specified)
        if let targetRole = role, roleStr != targetRole {
            // Role doesn't match, skip this element
        } else {
            // Role matches (or no role specified), check title/description
            var titleValue: CFTypeRef?
            var descValue: CFTypeRef?
            var identifierValue: CFTypeRef?
            
            let titleErr = AXUIElementCopyAttributeValue(element, kAXTitleAttribute as CFString, &titleValue)
            let descErr = AXUIElementCopyAttributeValue(element, kAXDescriptionAttribute as CFString, &descValue)
            let idErr = AXUIElementCopyAttributeValue(element, kAXIdentifierAttribute as CFString, &identifierValue)
            
            // Check if title, description, or identifier matches
            let titleStr = (titleErr == .success) ? (titleValue as? String) : nil
            let descStr = (descErr == .success) ? (descValue as? String) : nil
            let idStr = (idErr == .success) ? (identifierValue as? String) : nil
            
            // Normalize for comparison (case-insensitive, trim whitespace)
            let normalize: (String) -> String = { $0.lowercased().trimmingCharacters(in: .whitespaces) }
            let normalizedTarget = normalize(title)
            
            // Check for exact matches first (preferred)
            if let title = titleStr, normalize(title) == normalizedTarget {
                exactMatch = element
            } else if let desc = descStr, normalize(desc) == normalizedTarget {
                exactMatch = element
            } else if let id = idStr, normalize(id) == normalizedTarget {
                exactMatch = element
            } else {
                // Partial match (target contains or is contained in element text)
                // Only use partial match if element has no children (leaf node)
                // This prevents parent containers from matching
                if !hasChildren {
                    if let title = titleStr, normalize(title).contains(normalizedTarget) || normalizedTarget.contains(normalize(title)) {
                        partialMatch = element
                    } else if let desc = descStr, normalize(desc).contains(normalizedTarget) || normalizedTarget.contains(normalize(desc)) {
                        partialMatch = element
                    }
                }
            }
        }
    }
    
    // STEP 4: Return matches in priority order
    // exact from current > exact from children > partial from children > partial from current (leaf only)
    // Note: We already returned exact from children in STEP 2, so we only get here if no exact child match
    if exactMatch != nil {
        // Exact match from current element is better than partial from children
        return (exactMatch, nil)
    } else if childPartialMatch != nil {
        // If we have children with partial match, prefer it over current element's partial match
        // This ensures we get the most specific (deepest) match
        return (nil, childPartialMatch)
    } else {
        // Only return current element's partial match if it's a leaf node (no children)
        return (nil, partialMatch)
    }
}

// Wrapper function for backward compatibility
func searchElementTreeWrapper(_ element: AXUIElement, role: String?, title: String, depth: Int = 0, maxDepth: Int = 20) -> AXUIElement? {
    let (exact, partial) = searchElementTree(element, role: role, title: title, depth: depth, maxDepth: maxDepth)
    // Prefer exact match, fall back to partial match
    return exact ?? partial
}

// Check if we're looking for a menu bar item
let isMenuBarSearch = targetContext?.lowercased().contains("menu bar") == true || targetContext?.lowercased().contains("menubar") == true

var foundElement: AXUIElement? = nil

// Specialized function to search menu bar items with multiple strategies
func searchMenuBarItem(_ menuBar: AXUIElement, targetText: String, targetRole: String?) -> AXUIElement? {
    var menuBarChildrenValue: CFTypeRef?
    guard AXUIElementCopyAttributeValue(menuBar, kAXChildrenAttribute as CFString, &menuBarChildrenValue) == .success,
          let menuBarChildren = menuBarChildrenValue as? [AXUIElement] else {
        FileHandle.standardError.write(Data("Could not get menu bar children\n".utf8))
        return nil
    }
    
    FileHandle.standardError.write(Data("Menu bar has \(menuBarChildren.count) items:\n".utf8))
    
    let normalize: (String) -> String = { $0.lowercased().trimmingCharacters(in: .whitespaces) }
    let normalizedTarget = normalize(targetText)
    
    // Strategy 1: Search with exact role match
    if let role = targetRole {
        FileHandle.standardError.write(Data("Strategy 1: Searching with role '\(role)'\n".utf8))
        for (index, item) in menuBarChildren.enumerated() {
            var itemRoleValue: CFTypeRef?
            if AXUIElementCopyAttributeValue(item, kAXRoleAttribute as CFString, &itemRoleValue) == .success,
               let itemRole = itemRoleValue as? String, itemRole == role {
                var titleValue: CFTypeRef?
                if AXUIElementCopyAttributeValue(item, kAXTitleAttribute as CFString, &titleValue) == .success,
                   let title = titleValue as? String {
                    let info = getElementInfo(item)
                    FileHandle.standardError.write(Data("  [\(index)] \(info)\n".utf8))
                    if normalize(title) == normalizedTarget || normalize(title).contains(normalizedTarget) || normalizedTarget.contains(normalize(title)) {
                        FileHandle.standardError.write(Data("✓ Match found at index \(index)\n".utf8))
                        return item
                    }
                }
            }
        }
    }
    
    // Strategy 2: Search menu bar items (kAXMenuBarItemRole)
    FileHandle.standardError.write(Data("Strategy 2: Searching menu bar items (kAXMenuBarItemRole)\n".utf8))
    for (index, item) in menuBarChildren.enumerated() {
        var itemRoleValue: CFTypeRef?
        if AXUIElementCopyAttributeValue(item, kAXRoleAttribute as CFString, &itemRoleValue) == .success,
           let itemRole = itemRoleValue as? String, itemRole == kAXMenuBarItemRole {
            var titleValue: CFTypeRef?
            if AXUIElementCopyAttributeValue(item, kAXTitleAttribute as CFString, &titleValue) == .success,
               let title = titleValue as? String {
                let info = getElementInfo(item)
                FileHandle.standardError.write(Data("  [\(index)] \(info)\n".utf8))
                if normalize(title) == normalizedTarget || normalize(title).contains(normalizedTarget) || normalizedTarget.contains(normalize(title)) {
                    FileHandle.standardError.write(Data("✓ Match found at index \(index)\n".utf8))
                    return item
                }
            }
        }
    }
    
    // Strategy 3: Search menu items (kAXMenuItemRole) - sometimes menu bar items use this
    FileHandle.standardError.write(Data("Strategy 3: Searching menu items (kAXMenuItemRole)\n".utf8))
    for (index, item) in menuBarChildren.enumerated() {
        var itemRoleValue: CFTypeRef?
        if AXUIElementCopyAttributeValue(item, kAXRoleAttribute as CFString, &itemRoleValue) == .success,
           let itemRole = itemRoleValue as? String, itemRole == kAXMenuItemRole {
            var titleValue: CFTypeRef?
            if AXUIElementCopyAttributeValue(item, kAXTitleAttribute as CFString, &titleValue) == .success,
               let title = titleValue as? String {
                let info = getElementInfo(item)
                FileHandle.standardError.write(Data("  [\(index)] \(info)\n".utf8))
                if normalize(title) == normalizedTarget || normalize(title).contains(normalizedTarget) || normalizedTarget.contains(normalize(title)) {
                    FileHandle.standardError.write(Data("✓ Match found at index \(index)\n".utf8))
                    return item
                }
            }
        }
    }
    
    // Strategy 4: Search all items regardless of role (text match only)
    FileHandle.standardError.write(Data("Strategy 4: Searching all items (text match only)\n".utf8))
    for (index, item) in menuBarChildren.enumerated() {
        var titleValue: CFTypeRef?
        var descValue: CFTypeRef?
        if AXUIElementCopyAttributeValue(item, kAXTitleAttribute as CFString, &titleValue) == .success,
           let title = titleValue as? String {
            let info = getElementInfo(item)
            FileHandle.standardError.write(Data("  [\(index)] \(info)\n".utf8))
            if normalize(title) == normalizedTarget || normalize(title).contains(normalizedTarget) || normalizedTarget.contains(normalize(title)) {
                FileHandle.standardError.write(Data("✓ Match found at index \(index)\n".utf8))
                return item
            }
        } else if AXUIElementCopyAttributeValue(item, kAXDescriptionAttribute as CFString, &descValue) == .success,
                  let desc = descValue as? String {
            if normalize(desc) == normalizedTarget || normalize(desc).contains(normalizedTarget) || normalizedTarget.contains(normalize(desc)) {
                FileHandle.standardError.write(Data("✓ Match found at index \(index) (via description)\n".utf8))
                return item
            }
        }
    }
    
    return nil
}

// If searching for menu bar item, search menu bar directly
if isMenuBarSearch {
    FileHandle.standardError.write(Data("--- Menu Bar Search ---\n".utf8))
    
    // Method 1: Get menu bar from application via kAXMenuBarAttribute
    var menuBarValue: CFTypeRef?
    let menuBarErr = AXUIElementCopyAttributeValue(appElement, kAXMenuBarAttribute as CFString, &menuBarValue)
    
    if menuBarErr == .success, let menuBarValue = menuBarValue {
        let menuBar = unsafeBitCast(menuBarValue, to: AXUIElement.self)
        FileHandle.standardError.write(Data("✓ Menu bar found via kAXMenuBarAttribute\n".utf8))
        foundElement = searchMenuBarItem(menuBar, targetText: targetText, targetRole: targetRole)
        
        if foundElement == nil {
            FileHandle.standardError.write(Data("✗ Element '\(targetText)' not found in menu bar using specialized search\n".utf8))
            // Fallback to recursive search
            FileHandle.standardError.write(Data("Trying recursive search as fallback...\n".utf8))
            foundElement = searchElementTreeWrapper(menuBar, role: targetRole, title: targetText)
        } else {
            FileHandle.standardError.write(Data("✓ Found element in menu bar: \(getElementInfo(foundElement!))\n".utf8))
        }
    } else {
        FileHandle.standardError.write(Data("✗ Menu bar not accessible via kAXMenuBarAttribute (error: \(menuBarErr.rawValue))\n".utf8))
        
        // Method 2: Try to find menu bar by searching for kAXMenuBarRole in app element
        FileHandle.standardError.write(Data("Method 2: Searching for menu bar by role in app element\n".utf8))
        var menuBarByRole: AXUIElement? = nil
        func findMenuBar(_ element: AXUIElement) -> AXUIElement? {
            var roleValue: CFTypeRef?
            if AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &roleValue) == .success,
               let role = roleValue as? String, role == kAXMenuBarRole {
                return element
            }
            var childrenValue: CFTypeRef?
            if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &childrenValue) == .success,
               let children = childrenValue as? [AXUIElement] {
                for child in children {
                    if let found = findMenuBar(child) {
                        return found
                    }
                }
            }
            return nil
        }
        menuBarByRole = findMenuBar(appElement)
        
        if menuBarByRole != nil {
            let menuBar = menuBarByRole!
            FileHandle.standardError.write(Data("✓ Menu bar found by searching for kAXMenuBarRole\n".utf8))
            foundElement = searchMenuBarItem(menuBar, targetText: targetText, targetRole: targetRole)
            if foundElement == nil {
                foundElement = searchElementTreeWrapper(menuBar, role: targetRole, title: targetText)
            }
        } else {
            FileHandle.standardError.write(Data("✗ Menu bar not found by role search\n".utf8))
            // Method 3: Fallback to searching entire app element tree
            FileHandle.standardError.write(Data("Method 3: Searching entire app element tree\n".utf8))
            foundElement = searchElementTreeWrapper(appElement, role: targetRole, title: targetText)
            
            if foundElement == nil {
                FileHandle.standardError.write(Data("✗ Element not found in app element tree\n".utf8))
            }
        }
    }
}

// If not found in menu bar (or not a menu bar search), search windows
if foundElement == nil {
    if !isMenuBarSearch {
        FileHandle.standardError.write(Data("--- Window Search ---\n".utf8))
    }
    
    var windowsValue: CFTypeRef?
    let windowsErr = AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute as CFString, &windowsValue)
    
    if windowsErr == .success, let windows = windowsValue as? [AXUIElement] {
        FileHandle.standardError.write(Data("Found \(windows.count) windows, searching...\n".utf8))
        // Search in each window
        for (index, window) in windows.enumerated() {
            FileHandle.standardError.write(Data("Searching window \(index + 1)/\(windows.count)\n".utf8))
            if let element = searchElementTreeWrapper(window, role: targetRole, title: targetText) {
                foundElement = element
                FileHandle.standardError.write(Data("✓ Found element in window \(index + 1)\n".utf8))
                break
            }
        }
        if foundElement == nil {
            FileHandle.standardError.write(Data("✗ Element not found in any window\n".utf8))
        }
    } else {
        FileHandle.standardError.write(Data("✗ Could not get windows (error: \(windowsErr.rawValue)), searching from app element\n".utf8))
        // Fallback: search from app element directly
        foundElement = searchElementTreeWrapper(appElement, role: targetRole, title: targetText)
        if foundElement == nil {
            FileHandle.standardError.write(Data("✗ Element not found in app element tree\n".utf8))
        }
    }
}

guard let element = foundElement else {
    FileHandle.standardError.write(Data("=== Search Failed ===\n".utf8))
    FileHandle.standardError.write(Data("Could not find element with text='\(targetText)'\n".utf8))
    print("ERROR: Element not found")
    exit(1)
}

FileHandle.standardError.write(Data("=== Element Found ===\n".utf8))
FileHandle.standardError.write(Data("Element info: \(getElementInfo(element))\n".utf8))

// Get element position and size
var positionValue: CFTypeRef?
var sizeValue: CFTypeRef?

let posErr = AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &positionValue)
let sizeErr = AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &sizeValue)

guard posErr == .success, sizeErr == .success else {
    print("ERROR: Could not get element position or size")
    exit(1)
}

let axPos = unsafeBitCast(positionValue, to: AXValue.self)
let axSize = unsafeBitCast(sizeValue, to: AXValue.self)

// Extract CGPoint and CGSize
var point = CGPoint.zero
var size = CGSize.zero

guard AXValueGetValue(axPos, .cgPoint, &point),
      AXValueGetValue(axSize, .cgSize, &size) else {
    print("ERROR: Could not extract position or size values")
    exit(1)
}

// Convert to JSON output
let result: [String: Any] = [
    "x": Int(point.x),
    "y": Int(point.y),
    "width": Int(size.width),
    "height": Int(size.height)
]

let jsonData = try JSONSerialization.data(withJSONObject: result, options: [])
if let jsonString = String(data: jsonData, encoding: .utf8) {
    print(jsonString)
} else {
    print("ERROR: Could not serialize result to JSON")
    exit(1)
}
