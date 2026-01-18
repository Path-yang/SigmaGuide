#!/usr/bin/env swift

import Cocoa
import ApplicationServices

// Check if Accessibility permissions are granted (required for CGEventTap)
func checkAccessibilityPermission() -> Bool {
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: false]
    return AXIsProcessTrustedWithOptions(options as CFDictionary)
}

// Global flag to track if we should continue monitoring
var shouldContinue = true

// Signal handler to gracefully exit
signal(SIGINT) { _ in
    shouldContinue = false
    exit(0)
}

signal(SIGTERM) { _ in
    shouldContinue = false
    exit(0)
}

// Check permissions
if !checkAccessibilityPermission() {
    print("ERROR: Accessibility permissions not granted. Please enable in System Preferences > Security & Privacy > Privacy > Accessibility")
    exit(1)
}

// Create event tap to monitor mouse clicks using modern Swift API
let eventsOfInterest: CGEventMask = (1 << CGEventType.leftMouseDown.rawValue) | (1 << CGEventType.rightMouseDown.rawValue) | (1 << CGEventType.otherMouseDown.rawValue)

guard let eventTap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .defaultTap,
    eventsOfInterest: eventsOfInterest,
    callback: { (proxy, type, event, refcon) -> Unmanaged<CGEvent>? in
        // Check if it's a mouse down event
        if type == .leftMouseDown || type == .rightMouseDown || type == .otherMouseDown {
            let location = event.location
            let button = type == .leftMouseDown ? "left" : (type == .rightMouseDown ? "right" : "other")
            
            // Output JSON event (single line, no extra whitespace)
            let json = "{\"type\":\"click\",\"button\":\"\(button)\",\"x\":\(Int(location.x)),\"y\":\(Int(location.y)),\"timestamp\":\(Int(Date().timeIntervalSince1970 * 1000))}"
            print(json)
            fflush(stdout)
        }
        
        // Return the event unchanged (we're just observing)
        return Unmanaged.passUnretained(event)
    },
    userInfo: nil
) else {
    print("ERROR: Failed to create event tap. Make sure Accessibility permissions are granted.")
    exit(1)
}

// Create run loop source
let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
CGEvent.tapEnable(tap: eventTap, enable: true)

// Start run loop
print("{\"status\":\"started\"}")
fflush(stdout)

CFRunLoopRun()
