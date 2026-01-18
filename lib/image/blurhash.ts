import sharp from 'sharp'
import { encode, decode } from 'blurhash'

/**
 * Generate a blur data URL from an image buffer.
 *
 * This creates a color-accurate blur placeholder that can be used directly
 * in Next.js Image component's blurDataURL prop without client-side decoding.
 *
 * Process:
 * 1. Resize image to 32x32 for BlurHash encoding
 * 2. Encode to BlurHash string (compact representation)
 * 3. Decode back to raw pixels
 * 4. Convert to small JPEG data URL
 *
 * @param imageBuffer - The raw image buffer to process
 * @returns Base64 data URL string or null on failure
 */
export async function generateBlurDataUrl(imageBuffer: Buffer): Promise<string | null> {
  try {
    // 1. Resize to tiny image for BlurHash encoding
    const { data, info } = await sharp(imageBuffer)
      .resize(32, 32, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    // 2. Encode to BlurHash string
    const hash = encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3)

    // 3. Decode back to pixels
    const pixels = decode(hash, 32, 32)

    // 4. Convert to JPEG data URL using Sharp
    const jpegBuffer = await sharp(Buffer.from(pixels), {
      raw: { width: 32, height: 32, channels: 4 }
    }).jpeg({ quality: 40 }).toBuffer()

    return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`
  } catch (error) {
    // Log error but don't throw - caller should handle gracefully
    console.error('Failed to generate blur data URL:', error)
    return null
  }
}
