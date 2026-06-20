/**
 * Backfill image variants (thumbnail + medium WebP) for existing photos.
 *
 * Standalone runner that mirrors trigger/jobs/generate-image-variants.ts +
 * lib/image/variants.ts, for environments without a running Trigger.dev worker.
 * Additive only: never deletes or overwrites originals. Idempotent claim via
 * variant_status. See ADR 0003.
 *
 * Usage:
 *   node scripts/backfill-variants.mjs --limit 5     # sample
 *   node scripts/backfill-variants.mjs               # full backfill
 */
import './env.mjs'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const CFG = {
  thumbnail: { maxDim: 400, quality: 72, effort: 4 },
  medium: { maxDim: 1080, quality: 80, effort: 4 },
}
const MAX_INPUT_PIXELS = 60_000_000
const BUCKET = 'photos'

const args = process.argv.slice(2)
const limitIdx = args.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity
const CONCURRENCY = 4

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

async function genVariants(buf) {
  const p = () => sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'none' }).rotate().toColorspace('srgb')
  const thumbnail = await p().resize(CFG.thumbnail.maxDim, CFG.thumbnail.maxDim, { fit: 'inside', withoutEnlargement: true }).webp({ quality: CFG.thumbnail.quality, effort: CFG.thumbnail.effort }).toBuffer()
  const medium = await p().resize(CFG.medium.maxDim, CFG.medium.maxDim, { fit: 'inside', withoutEnlargement: true }).webp({ quality: CFG.medium.quality, effort: CFG.medium.effort }).toBuffer()
  return { thumbnail, medium }
}

async function processOne(image) {
  const id = image.id
  // Claim
  const { data: claimed } = await supabase
    .from('images')
    .update({ variant_status: 'processing' })
    .eq('id', id)
    .in('variant_status', ['pending', 'failed'])
    .select('id, file_path')
    .maybeSingle()
  if (!claimed) return { id, skipped: true }

  try {
    const { data: signed, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrl(claimed.file_path, 3600)
    if (signErr || !signed) throw new Error(`sign: ${signErr?.message}`)
    const res = await fetch(signed.signedUrl)
    if (!res.ok) throw new Error(`download ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const v = await genVariants(buf)
    const thumbPath = `thumbnails/${id}.webp`
    const medPath = `medium/${id}.webp`
    const [t, m] = await Promise.all([
      supabase.storage.from(BUCKET).upload(thumbPath, v.thumbnail, { contentType: 'image/webp', upsert: true }),
      supabase.storage.from(BUCKET).upload(medPath, v.medium, { contentType: 'image/webp', upsert: true }),
    ])
    if (t.error) throw new Error(`thumb upload: ${t.error.message}`)
    if (m.error) throw new Error(`medium upload: ${m.error.message}`)
    await supabase.from('images').update({
      thumbnail_path: thumbPath, medium_path: medPath, variant_status: 'ready', variant_error: null,
    }).eq('id', id)
    return { id, ok: true, thumbKB: (v.thumbnail.length / 1024).toFixed(1), medKB: (v.medium.length / 1024).toFixed(1) }
  } catch (e) {
    await supabase.from('images').update({ variant_status: 'failed', variant_error: String(e.message || e) }).eq('id', id)
    return { id, error: String(e.message || e) }
  }
}

async function main() {
  let done = 0, ok = 0, failed = 0, skipped = 0
  let maxThumb = 0
  while (done < LIMIT) {
    const pageSize = Math.min(CONCURRENCY * 5, LIMIT - done)
    const { data: page, error } = await supabase
      .from('images').select('id, file_path').eq('variant_status', 'pending')
      .order('created_at', { ascending: true }).limit(pageSize)
    if (error) { console.error('query error', error.message); break }
    if (!page || page.length === 0) break

    for (let i = 0; i < page.length; i += CONCURRENCY) {
      const batch = page.slice(i, i + CONCURRENCY)
      const results = await Promise.all(batch.map(processOne))
      for (const r of results) {
        done++
        if (r.ok) { ok++; maxThumb = Math.max(maxThumb, parseFloat(r.thumbKB)); }
        else if (r.error) { failed++; console.log(`  FAIL ${r.id}: ${r.error}`) }
        else if (r.skipped) skipped++
      }
      console.log(`progress: done=${done} ok=${ok} failed=${failed} skipped=${skipped} maxThumbKB=${maxThumb}`)
    }
    if (page.length < pageSize) break
  }
  console.log(`\nDONE: processed=${done} ok=${ok} failed=${failed} skipped=${skipped} maxThumbKB=${maxThumb}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
