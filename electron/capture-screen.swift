#!/usr/bin/env swift

import Cocoa
import Foundation
import CoreGraphics

// Get window IDs to exclude from command line arguments
let excludeWindowIds = CommandLine.arguments.dropFirst().compactMap { Int($0) }

// Get primary display bounds
guard let mainDisplay = NSScreen.main else {
    print("ERROR: Could not get main display")
    exit(1)
}

let displayBounds = mainDisplay.frame

// Capture at nominal (logical) resolution instead of best (physical) resolution
// This ensures screenshot coordinates map 1:1 to screen logical coordinates
// .nominalResolution = logical pixels (e.g., 1920x1080)
// .bestResolution = physical pixels (e.g., 3840x2160 on Retina)
let image = CGWindowListCreateImage(
    displayBounds,
    .optionOnScreenOnly,
    kCGNullWindowID,
    .nominalResolution  // Changed from .bestResolution
)

guard let cgImage = image else {
    print("ERROR: Could not create screen capture")
    exit(1)
}

// Convert to NSImage then to PNG data
let nsImage = NSImage(cgImage: cgImage, size: displayBounds.size)
guard let tiffData = nsImage.tiffRepresentation,
      let bitmapImage = NSBitmapImageRep(data: tiffData),
      let pngData = bitmapImage.representation(using: NSBitmapImageRep.FileType.png, properties: [:]) else {
    print("ERROR: Could not convert image to PNG")
    exit(1)
}

// Output base64 encoded PNG
let base64String = pngData.base64EncodedString()
print(base64String)
