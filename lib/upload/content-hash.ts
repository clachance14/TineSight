/** Hash original bytes. Callers bound preparation to at most two files in memory. */
export async function hashPhotoContent(file: Blob): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}
