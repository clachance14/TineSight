/**
 * Shared validation utilities
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Validates that a value is a valid UUID string
 * @param value - The value to validate
 * @returns Type guard indicating if value is a valid UUID string
 */
export function isValidUUID(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value)
}
