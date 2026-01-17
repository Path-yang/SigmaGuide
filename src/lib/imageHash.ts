/**
 * Simple perceptual image hashing for comparing screenshots
 * Uses average hash (aHash) algorithm - fast and good enough for UI change detection
 */

/**
 * Convert base64 image to a simple perceptual hash
 * Returns a 64-bit hash as a hex string
 */
export async function getImageHash(base64Image: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      // Create small canvas for hashing (8x8)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      
      // Resize to 8x8 for simple hash
      canvas.width = 8
      canvas.height = 8
      
      // Draw image scaled down
      ctx.drawImage(img, 0, 0, 8, 8)
      
      // Get pixel data
      const imageData = ctx.getImageData(0, 0, 8, 8)
      const pixels = imageData.data
      
      // Convert to grayscale and calculate average
      const grayPixels: number[] = []
      for (let i = 0; i < pixels.length; i += 4) {
        const gray = (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114)
        grayPixels.push(gray)
      }
      
      const avg = grayPixels.reduce((a, b) => a + b, 0) / grayPixels.length
      
      // Create hash: 1 if pixel > average, 0 otherwise
      let hash = ''
      for (const pixel of grayPixels) {
        hash += pixel > avg ? '1' : '0'
      }
      
      // Convert binary to hex for compact storage
      const hexHash = parseInt(hash, 2).toString(16).padStart(16, '0')
      resolve(hexHash)
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
 * Returns number of different bits (0 = identical, 64 = completely different)
 */
export function hashDistance(hash1: string, hash2: string): number {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) {
    return 64 // Maximum distance if invalid
  }
  
  // Convert hex back to binary for comparison
  const bin1 = parseInt(hash1, 16).toString(2).padStart(64, '0')
  const bin2 = parseInt(hash2, 16).toString(2).padStart(64, '0')
  
  let distance = 0
  for (let i = 0; i < bin1.length; i++) {
    if (bin1[i] !== bin2[i]) {
      distance++
    }
  }
  
  return distance
}

/**
 * Check if two images are similar enough to skip API call
 * threshold: number of bits that can differ (lower = stricter)
 * Default threshold of 5 means ~92% similar
 */
export function areImagesSimilar(hash1: string, hash2: string, threshold = 5): boolean {
  const distance = hashDistance(hash1, hash2)
  return distance <= threshold
}
