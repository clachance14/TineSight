/**
 * Brand-specific parsers to extract device identifiers from EXIF
 * Different manufacturers store camera identification in different fields
 */

export interface ExifData {
  Make?: string
  Model?: string
  ImageDescription?: string
  DateTimeOriginal?: Date | string  // exifr returns Date objects
  DateTime?: Date | string           // exifr returns Date objects
  [key: string]: unknown
}

type BrandParser = (exif: ExifData) => string | null

const brandParsers: Record<string, BrandParser> = {
  // MUDDY cameras store camera slot as [MP:XX] in ImageDescription
  // Example: "Trail Camera[MP:05]" → "MP:05"
  MUDDY: (exif) => {
    const match = exif.ImageDescription?.match(/\[MP:(\d+)\]/)
    return match ? `MP:${match[1]}` : null
  },

  // Add more brand parsers as needed
  // RECONYX: (exif) => { ... parse serial from MakerNote ... }
  // BUSHNELL: (exif) => { ... }
}

/**
 * Get device identifier using brand-specific parser
 */
export function getDeviceIdentifier(exif: ExifData): string | null {
  const make = exif.Make?.toUpperCase()
  const parser = make ? brandParsers[make] : null
  return parser ? parser(exif) : null
}

export { brandParsers }
