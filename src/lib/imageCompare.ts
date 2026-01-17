/**
 * Local image comparison utilities for detecting screen changes
 * Uses perceptual hashing - fast, runs locally, no API needed
 */

/**
 * Calculate perceptual hash (pHash) of an image
 * Returns a 64-bit hash as a string of 0s and 1s
 * 
 * This is robust to:
 * - Minor compression differences
 * - Small color variations
 * But sensitive to:
 * - UI element changes (buttons, checkboxes, menus)
 * - Text changes
 * - Layout changes
 */
export function calculatePerceptualHash(base64Image: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      
      // Step 1: Resize to 32x32 (larger than typical 8x8 for more sensitivity)
      canvas.width = 32
      canvas.height = 32
      ctx.drawImage(img, 0, 0, 32, 32)
      
      // Step 2: Convert to grayscale
      const imageData = ctx.getImageData(0, 0, 32, 32)
      const pixels = imageData.data
      const grayPixels: number[] = []
      
      for (let i = 0; i < pixels.length; i += 4) {
        // Standard grayscale conversion
        const gray = Math.round(
          pixels[i] * 0.299 +      // R
          pixels[i + 1] * 0.587 +  // G
          pixels[i + 2] * 0.114    // B
        )
        grayPixels.push(gray)
      }
      
      // Step 3: Calculate DCT-like average (simplified)
      // For each 4x4 block, calculate average
      const blockSize = 4
      const blocksPerRow = 32 / blockSize // 8 blocks
      const blockAverages: number[] = []
      
      for (let blockY = 0; blockY < blocksPerRow; blockY++) {
        for (let blockX = 0; blockX < blocksPerRow; blockX++) {
          let sum = 0
          for (let y = 0; y < blockSize; y++) {
            for (let x = 0; x < blockSize; x++) {
              const pixelX = blockX * blockSize + x
              const pixelY = blockY * blockSize + y
              const idx = pixelY * 32 + pixelX
              sum += grayPixels[idx]
            }
          }
          blockAverages.push(sum / (blockSize * blockSize))
        }
      }
      
      // Step 4: Calculate overall average
      const overallAvg = blockAverages.reduce((a, b) => a + b, 0) / blockAverages.length
      
      // Step 5: Generate hash - 1 if above average, 0 if below
      let hash = ''
      for (const avg of blockAverages) {
        hash += avg > overallAvg ? '1' : '0'
      }
      
      resolve(hash)
    }
    
    img.onerror = () => {
      // Return empty hash on error
      resolve('')
    }
    
    img.src = base64Image
  })
}

/**
 * Calculate Hamming distance between two hashes
 * Returns the number of bits that are different
 * 
 * 0 = identical images
 * 1-3 = very similar (probably just noise/compression)
 * 4+ = something actually changed
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (!hash1 || !hash2) return 64 // Max distance if invalid
  if (hash1.length !== hash2.length) return 64
  
  let distance = 0
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) {
      distance++
    }
  }
  return distance
}

/**
 * Check if screen has changed meaningfully
 * 
 * @param threshold - Max bits that can differ and still be "same"
 *                    Low threshold (2-3) = very sensitive, catches small UI changes
 *                    High threshold (8+) = only catches major changes
 * 
 * Returns: { changed: boolean, distance: number }
 */
export function hasScreenChanged(
  hash1: string, 
  hash2: string, 
  threshold: number = 3  // Very sensitive - catches checkbox changes etc.
): { changed: boolean; distance: number } {
  const distance = hammingDistance(hash1, hash2)
  return {
    changed: distance > threshold,
    distance
  }
}

/**
 * Quick pixel-based difference check as a backup
 * Compares center region of images (where UI usually changes)
 */
export function calculatePixelDifference(base64Image1: string, base64Image2: string): Promise<number> {
  return new Promise((resolve) => {
    const img1 = new Image()
    const img2 = new Image()
    let loaded = 0
    
    const checkBoth = () => {
      loaded++
      if (loaded < 2) return
      
      const canvas1 = document.createElement('canvas')
      const canvas2 = document.createElement('canvas')
      const size = 64 // Compare at 64x64 for speed
      
      canvas1.width = canvas2.width = size
      canvas1.height = canvas2.height = size
      
      const ctx1 = canvas1.getContext('2d')!
      const ctx2 = canvas2.getContext('2d')!
      
      ctx1.drawImage(img1, 0, 0, size, size)
      ctx2.drawImage(img2, 0, 0, size, size)
      
      const data1 = ctx1.getImageData(0, 0, size, size).data
      const data2 = ctx2.getImageData(0, 0, size, size).data
      
      let diffPixels = 0
      const totalPixels = size * size
      
      for (let i = 0; i < data1.length; i += 4) {
        // Compare RGB (ignore alpha)
        const diff = Math.abs(data1[i] - data2[i]) +
                    Math.abs(data1[i + 1] - data2[i + 1]) +
                    Math.abs(data1[i + 2] - data2[i + 2])
        
        // If any channel differs by more than 30, count as different pixel
        if (diff > 90) {
          diffPixels++
        }
      }
      
      resolve(diffPixels / totalPixels)
    }
    
    img1.onload = checkBoth
    img2.onload = checkBoth
    img1.onerror = () => resolve(1)
    img2.onerror = () => resolve(1)
    
    img1.src = base64Image1
    img2.src = base64Image2
  })
}
