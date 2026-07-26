/**
 * Reset a user's account to a clean slate.
 *
 * Deletes every row and every storage object the user owns — photos, detections,
 * cameras, locations, bucks, batches, upload sessions, saved filters — while keeping
 * their auth user and profile row intact so they can still log in.
 *
 * THIS IS IRREVERSIBLE. There is no backup step. Dry run is the default.
 *
 * Usage:
 *   node scripts/reset-user-account.mjs --email someone@example.com             # dry run
 *   node scripts/reset-user-account.mjs --email someone@example.com --confirm   # execute
 *   node scripts/reset-user-account.mjs --user-id <uuid> --confirm
 *   node scripts/reset-user-account.mjs --email x@y.com --confirm --force-inflight
 *
 * Ordering matters and is not arbitrary:
 *   - storage paths are collected BEFORE any delete (thumbnails/, medium/ and crops/ are
 *     flat shared prefixes, unreachable once the rows are gone)
 *   - deer.reference_detection_id (migration 008) has no ON DELETE, so it is NULLed and
 *     deer are deleted before images, or the detections cascade fails
 *   - images are deleted in chunks because the detection_best_score trigger (migration 049)
 *     fires per row and a single statement would time out
 */

import './env.mjs'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const BUCKET = 'photos'
const EXPORTS_BUCKET = 'exports'
const PAGE_SIZE = 1000        // Supabase caps a single select at 1000 rows
// Images per delete statement. Bounded by two things: the per-row
// detection_best_score trigger (migration 049) fires on every cascaded detection, and
// `.in('id', ...)` is serialized into the query string, which PostgREST rejects
// somewhere between 250 and 500 uuids. 150 keeps clear margin under both.
const DELETE_CHUNK = 150
const STORAGE_BATCH = 1000    // Supabase storage.remove() limit per call

const args = process.argv.slice(2)
const argValue = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}
const EMAIL = argValue('--email')
const USER_ID_ARG = argValue('--user-id')
const CONFIRM = args.includes('--confirm')
const FORCE_INFLIGHT = args.includes('--force-inflight')

if (!EMAIL && !USER_ID_ARG) {
  console.error('Usage: node scripts/reset-user-account.mjs --email <email> [--confirm]')
  console.error('   or: node scripts/reset-user-account.mjs --user-id <uuid> [--confirm]')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Count rows in a table scoped directly by user_id. */
async function countByUser(table, userId) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (error) return { count: null, error: error.message }
  return { count, error: null }
}

/** Count rows in a table scoped through a parent relation (no own user_id). */
async function countByRelation(table, relation, userId) {
  const { count, error } = await supabase
    .from(table)
    .select(relation, { count: 'exact', head: true })
    .eq(`${relation.split('!')[0]}.user_id`, userId)
  if (error) return { count: null, error: error.message }
  return { count, error: null }
}

/**
 * Page through a select that exceeds the server's PostgREST max-rows cap.
 *
 * max-rows is a hard server-side ceiling (Supabase API settings) that silently truncates
 * any response — no error, no warning. It is currently 1000 on this project but is an
 * operator-tunable setting, so this loop must NOT assume the page size it asked for is the
 * page size it gets. Advance by however many rows actually came back and stop only on an
 * empty page; that is correct for any max-rows value.
 */
async function selectAllPages(buildQuery, label) {
  const rows = []
  let from = 0
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`Failed paging ${label}: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...data)
    from += data.length
  }
  return rows
}

const chunk = (arr, size) => {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Recursively list every object key under a bucket prefix. Directories have a null id. */
async function listPrefixRecursive(bucket, prefix) {
  const keys = []
  const walk = async (path) => {
    let offset = 0
    for (;;) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(path, { limit: PAGE_SIZE, offset })
      if (error) {
        console.warn(`   ! list ${bucket}/${path} failed: ${error.message}`)
        return
      }
      if (!data || data.length === 0) return
      for (const entry of data) {
        const full = path ? `${path}/${entry.name}` : entry.name
        if (entry.id === null) await walk(full)   // directory
        else keys.push(full)
      }
      // Advance by what actually came back — the server may cap below the requested limit.
      offset += data.length
    }
  }
  await walk(prefix)
  return keys
}

/** Remove storage keys in batches. Never fatal — collects errors and reports. */
async function removeStorage(bucket, keys) {
  const errors = []
  let removed = 0
  const batches = chunk(keys, STORAGE_BATCH)
  for (const [i, batch] of batches.entries()) {
    const { data, error } = await supabase.storage.from(bucket).remove(batch)
    if (error) {
      errors.push(`${bucket} batch ${i + 1}/${batches.length}: ${error.message}`)
    } else {
      removed += data?.length ?? batch.length
    }
    if ((i + 1) % 10 === 0 || i === batches.length - 1) {
      console.log(`   ${bucket}: batch ${i + 1}/${batches.length} (${removed} removed)`)
    }
  }
  return { removed, errors }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(70))
  console.log('TineSight — reset user account')
  console.log(`Supabase project: ${SUPABASE_URL}`)
  console.log(CONFIRM ? 'MODE: EXECUTE (irreversible)' : 'MODE: DRY RUN (no writes)')
  console.log('='.repeat(70))

  // -- 1. resolve the user ---------------------------------------------------
  let userId = USER_ID_ARG
  let profile

  if (EMAIL) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, subscription_tier, trophy_threshold')
      .eq('email', EMAIL)
      .limit(2)
    if (error) throw new Error(`Profile lookup failed: ${error.message}`)
    if (!data || data.length === 0) throw new Error(`No profile found for email ${EMAIL}`)
    if (data.length > 1) throw new Error(`Multiple profiles share email ${EMAIL} — pass --user-id instead`)
    profile = data[0]
    if (userId && userId !== profile.id) {
      throw new Error(`--email resolves to ${profile.id} but --user-id says ${userId}`)
    }
    userId = profile.id
  } else {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, subscription_tier, trophy_threshold')
      .eq('id', userId)
      .maybeSingle()
    if (error) throw new Error(`Profile lookup failed: ${error.message}`)
    if (!data) throw new Error(`No profile found for id ${userId}`)
    profile = data
  }

  console.log('\nTARGET ACCOUNT')
  console.log(`  id        : ${profile.id}`)
  console.log(`  email     : ${profile.email}`)
  console.log(`  full_name : ${profile.full_name}`)

  // -- 2. safety gate: in-flight work ---------------------------------------
  const { data: inflight, error: inflightErr } = await supabase
    .from('processing_batches')
    .select('id, status, created_at')
    .eq('user_id', userId)
    .eq('status', 'processing')
  if (inflightErr) throw new Error(`In-flight check failed: ${inflightErr.message}`)

  if (inflight && inflight.length > 0) {
    console.log(`\n⚠️  ${inflight.length} batch(es) still processing:`)
    inflight.forEach((b) => console.log(`     ${b.id}  (started ${b.created_at})`))
    if (!FORCE_INFLIGHT) {
      console.error('\n❌ Refusing to run while background jobs may still be writing.')
      console.error('   Let them finish, or cancel them in the Trigger.dev dashboard, then re-run.')
      console.error('   To override anyway: add --force-inflight')
      process.exit(2)
    }
    console.log('   --force-inflight set; continuing anyway.')
  }

  // -- 3. inventory ----------------------------------------------------------
  const DIRECT_TABLES = [
    'images', 'processing_batches', 'upload_sessions',
    'cameras', 'locations', 'deer', 'trophy_clusters',
    'showcases', 'filter_presets', 'team_members',
  ]

  console.log('\nINVENTORY')
  const inventory = {}
  for (const t of DIRECT_TABLES) {
    const { count, error } = await countByUser(t, userId)
    inventory[t] = count
    console.log(`  ${t.padEnd(22)} ${error ? 'ERR ' + error : count}`)
  }
  const det = await countByRelation('detections', 'images!inner(user_id)', userId)
  const bm = await countByRelation('batch_metrics', 'processing_batches!inner(user_id)', userId)
  inventory['detections'] = det.count
  inventory['batch_metrics'] = bm.count
  console.log(`  ${'detections'.padEnd(22)} ${det.error ? 'ERR ' + det.error : det.count}  (via images.user_id)`)
  console.log(`  ${'batch_metrics'.padEnd(22)} ${bm.error ? 'ERR ' + bm.error : bm.count}  (via processing_batches.user_id)`)

  // -- 4. collect storage paths BEFORE deleting anything ---------------------
  console.log('\nCollecting storage paths (must happen before any delete)…')

  const imageRows = await selectAllPages(
    () => supabase
      .from('images')
      .select('id, file_path, thumbnail_path, medium_path')
      .eq('user_id', userId)
      .order('id'),
    'images'
  )
  console.log(`  images rows            : ${imageRows.length}`)

  // Deliberately NOT filtering deleted_at — soft-deleted detections still own crop files.
  const detectionRows = await selectAllPages(
    () => supabase
      .from('detections')
      .select('id, crop_file_path, images!inner(user_id)')
      .eq('images.user_id', userId)
      .order('id'),
    'detections'
  )
  console.log(`  detection rows         : ${detectionRows.length}`)

  const storagePaths = []
  let nOriginals = 0, nThumbs = 0, nMedium = 0, nCrops = 0
  for (const r of imageRows) {
    if (r.file_path) { storagePaths.push(r.file_path); nOriginals++ }
    if (r.thumbnail_path) { storagePaths.push(r.thumbnail_path); nThumbs++ }
    if (r.medium_path) { storagePaths.push(r.medium_path); nMedium++ }
  }
  for (const r of detectionRows) {
    if (r.crop_file_path) { storagePaths.push(r.crop_file_path); nCrops++ }
  }

  console.log(`    originals            : ${nOriginals}`)
  console.log(`    thumbnails           : ${nThumbs}`)
  console.log(`    medium               : ${nMedium}`)
  console.log(`    crops                : ${nCrops}`)
  console.log(`  TOTAL storage objects  : ${storagePaths.length}`)

  const imageIds = imageRows.map((r) => r.id)

  // -- dry run stops here ----------------------------------------------------
  if (!CONFIRM) {
    console.log('\n' + '-'.repeat(70))
    console.log('DRY RUN — nothing was deleted.')
    console.log(`Re-run with --confirm to permanently delete the above for ${profile.email}.`)
    console.log('-'.repeat(70))
    return
  }

  // -- 5. clear the blocking FK ---------------------------------------------
  console.log('\nDELETING…')
  console.log('  clearing deer.reference_detection_id / representative_image_id')
  const { error: nullErr } = await supabase
    .from('deer')
    .update({ reference_detection_id: null, representative_image_id: null })
    .eq('user_id', userId)
  if (nullErr) throw new Error(`Failed clearing deer FKs: ${nullErr.message}`)

  // -- 6. delete rows in FK-safe order --------------------------------------
  const deleteByUser = async (table) => {
    const { count, error } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .eq('user_id', userId)
    if (error) throw new Error(`Failed deleting ${table}: ${error.message}`)
    console.log(`  ${table.padEnd(22)} deleted ${count ?? 0}`)
  }

  // deer before images: reference_detection_id has no ON DELETE (migration 008)
  await deleteByUser('deer')
  await deleteByUser('showcases')
  await deleteByUser('trophy_clusters')

  // images chunked: detection_best_score trigger fires per cascaded detection
  const chunks = chunk(imageIds, DELETE_CHUNK)
  let imagesDeleted = 0
  for (const [i, ids] of chunks.entries()) {
    const { count, error } = await supabase
      .from('images')
      .delete({ count: 'exact' })
      .in('id', ids)
    if (error) throw new Error(`Failed deleting images chunk ${i + 1}/${chunks.length}: ${error.message}`)
    imagesDeleted += count ?? 0
    if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
      console.log(`  images                 chunk ${i + 1}/${chunks.length} (${imagesDeleted} deleted)`)
    }
  }

  await deleteByUser('processing_batches')  // cascades batch_metrics; before upload_sessions
  await deleteByUser('upload_sessions')
  await deleteByUser('cameras')
  await deleteByUser('locations')
  await deleteByUser('filter_presets')

  const { count: tmCount, error: tmErr } = await supabase
    .from('team_members')
    .delete({ count: 'exact' })
    .or(`user_id.eq.${userId},account_id.eq.${userId}`)
  if (tmErr) throw new Error(`Failed deleting team_members: ${tmErr.message}`)
  console.log(`  ${'team_members'.padEnd(22)} deleted ${tmCount ?? 0}`)

  // -- 7. delete storage -----------------------------------------------------
  console.log(`\nRemoving ${storagePaths.length} storage objects from '${BUCKET}'…`)
  const unique = [...new Set(storagePaths)]
  const { removed, errors } = await removeStorage(BUCKET, unique)
  console.log(`  removed ${removed} / ${unique.length}`)

  // -- 8. sweep leftover prefixes -------------------------------------------
  console.log('\nSweeping leftover prefixes…')
  const strayPhotos = await listPrefixRecursive(BUCKET, userId)
  if (strayPhotos.length > 0) {
    console.log(`  ${BUCKET}/${userId}/ still has ${strayPhotos.length} object(s) — removing`)
    const r = await removeStorage(BUCKET, strayPhotos)
    errors.push(...r.errors)
  } else {
    console.log(`  ${BUCKET}/${userId}/ empty`)
  }

  const strayExports = await listPrefixRecursive(EXPORTS_BUCKET, userId)
  if (strayExports.length > 0) {
    console.log(`  ${EXPORTS_BUCKET}/${userId}/ has ${strayExports.length} object(s) — removing`)
    const r = await removeStorage(EXPORTS_BUCKET, strayExports)
    errors.push(...r.errors)
  } else {
    console.log(`  ${EXPORTS_BUCKET}/${userId}/ empty`)
  }

  if (errors.length > 0) {
    console.log(`\n⚠️  ${errors.length} storage error(s):`)
    errors.slice(0, 20).forEach((e) => console.log(`     ${e}`))
    if (errors.length > 20) console.log(`     … and ${errors.length - 20} more`)
  }

  // -- 9. verify -------------------------------------------------------------
  console.log('\nVERIFYING…')
  let clean = true
  for (const t of DIRECT_TABLES) {
    const { count, error } = await countByUser(t, userId)
    const ok = !error && count === 0
    if (!ok) clean = false
    console.log(`  ${ok ? '✅' : '❌'} ${t.padEnd(22)} ${error ? 'ERR ' + error : count}`)
  }
  const detAfter = await countByRelation('detections', 'images!inner(user_id)', userId)
  const bmAfter = await countByRelation('batch_metrics', 'processing_batches!inner(user_id)', userId)
  for (const [label, res] of [['detections', detAfter], ['batch_metrics', bmAfter]]) {
    const ok = !res.error && res.count === 0
    if (!ok) clean = false
    console.log(`  ${ok ? '✅' : '❌'} ${label.padEnd(22)} ${res.error ? 'ERR ' + res.error : res.count}`)
  }

  const leftoverPhotos = await listPrefixRecursive(BUCKET, userId)
  const leftoverExports = await listPrefixRecursive(EXPORTS_BUCKET, userId)
  const storageOk = leftoverPhotos.length === 0 && leftoverExports.length === 0
  if (!storageOk) clean = false
  console.log(`  ${storageOk ? '✅' : '❌'} storage prefixes      photos=${leftoverPhotos.length} exports=${leftoverExports.length}`)

  const { data: stillThere } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('id', userId)
    .maybeSingle()
  const profileOk = Boolean(stillThere)
  if (!profileOk) clean = false
  console.log(`  ${profileOk ? '✅' : '❌'} profile preserved     ${stillThere?.email ?? 'MISSING'}`)

  console.log('\n' + '='.repeat(70))
  if (clean && errors.length === 0) {
    console.log(`✅ ${profile.email} reset to a clean slate. Login preserved.`)
  } else if (clean) {
    console.log(`✅ Database clean for ${profile.email}, but ${errors.length} storage error(s) above — re-run to sweep.`)
  } else {
    console.log(`❌ Reset incomplete for ${profile.email}. See ❌ rows above; the script is idempotent, so re-run.`)
  }
  console.log('='.repeat(70))

  if (!clean) process.exitCode = 1
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error('\n❌ FAILED:', e.message)
    process.exit(1)
  })
