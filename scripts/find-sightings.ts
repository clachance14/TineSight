import './env.mjs'
import { writeFile } from 'fs/promises'
import { createClient } from '@supabase/supabase-js'
import { compareFingerprints } from '../lib/fingerprint/compare'

// Rank unassigned fingerprinted buck detections by antler-fingerprint similarity
// to a given deer's reference, exactly like the re-ID loop — to eyeball accuracy.
const DEER_ID = process.argv[2] ?? 'b1dc3129-170b-478e-9105-f714eeb0a338'
const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

const sign = async (path: string | null): Promise<string> => {
  if (!path) return '(no crop)'
  const { data } = await s.storage.from('photos').createSignedUrl(path, 3600)
  return data?.signedUrl ?? '(sign failed)'
}

async function main(): Promise<void> {
const download = async (path: string | null, dest: string): Promise<void> => {
  if (!path) return
  const url = await sign(path)
  if (url.startsWith('(')) return
  const resp = await fetch(url)
  const buf = Buffer.from(await resp.arrayBuffer())
  await writeFile(dest, buf)
}

const { data: deer } = await s.from('deer').select('id, name, reference_detection_id').eq('id', DEER_ID).single()
if (!deer?.reference_detection_id) { console.log('Deer or reference not found'); process.exit(1) }

const { data: ref } = await s.from('detections')
  .select('id, antler_fingerprint, crop_file_path, score_gross')
  .eq('id', deer.reference_detection_id).single()
const refFp = ref?.antler_fingerprint as any
if (!refFp) { console.log(`"${deer.name}" reference detection has NO fingerprint — cannot re-ID.`); process.exit(0) }

console.log(`\nReference buck: "${deer.name}"  (score ${ref?.score_gross ?? '—'})`)
console.log(`Reference crop: ${await sign(ref?.crop_file_path ?? null)}\n`)

// Pull all OTHER fingerprinted detections (unassigned bucks are the real candidates,
// but include assigned-to-others too so we can see if it wrongly matches a known buck).
const candidates: Array<{ id: string; fp: any; crop: string | null; score: number | null; deer_id: string | null }> = []
let from = 0
for (;;) {
  const { data, error } = await s.from('detections')
    .select('id, antler_fingerprint, crop_file_path, score_gross, deer_id')
    .not('antler_fingerprint', 'is', null)
    .neq('id', ref!.id)
    .order('id', { ascending: true })
    .range(from, from + 999)
  if (error) { console.error(error.message); process.exit(1) }
  if (!data || data.length === 0) break
  for (const d of data) candidates.push({ id: d.id, fp: d.antler_fingerprint, crop: d.crop_file_path, score: d.score_gross, deer_id: d.deer_id })
  if (data.length < 1000) break
  from += 1000
}

const scored = candidates.map((c) => {
  let sim = 0
  try { sim = compareFingerprints(refFp, c.fp).overall_similarity } catch { sim = -1 }
  return { ...c, sim }
}).sort((a, b) => b.sim - a.sim)

const STRONG = 85, AMBIG = 70
const strong = scored.filter((c) => c.sim >= STRONG).length
const ambiguous = scored.filter((c) => c.sim >= AMBIG && c.sim < STRONG).length
console.log(`Compared against ${candidates.length} fingerprinted detections.`)
console.log(`Bands → strong(≥${STRONG}%): ${strong}   ambiguous(${AMBIG}–${STRONG}%): ${ambiguous}\n`)
console.log(`Top 15 by similarity (open the crop to judge if it's really ${deer.name}):\n`)

const top = scored.slice(0, 15)
let i = 0
for (const c of top) {
  const tag = c.deer_id ? '[already assigned]' : c.sim >= STRONG ? '[would propose]' : c.sim >= AMBIG ? '[would escalate to Gemini]' : ''
  console.log(`#${String(i + 1).padStart(2)}  ${c.sim.toFixed(1).padStart(5)}%  score ${String(c.score ?? '—').padStart(3)}  ${tag}`)
  i++
}
// Download reference + top 6 crops so we can eyeball them.
await download(ref?.crop_file_path ?? null, '/tmp/sight_ref.jpg')
for (let k = 0; k < Math.min(6, top.length); k++) {
  await download(top[k].crop, `/tmp/sight_${k + 1}.jpg`)
}
console.log('\nDownloaded ref + top 6 to /tmp/sight_ref.jpg, /tmp/sight_1..6.jpg')
}

main().catch((e) => { console.error(e); process.exit(1) })
