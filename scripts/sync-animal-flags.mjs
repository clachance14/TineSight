/**
 * Sync animal presence flags (has_goats, has_hogs, etc.) with actual detection records.
 *
 * This script fixes any mismatch between the boolean flags on the images table
 * and the actual detection records in the detections table.
 *
 * Usage: node scripts/sync-animal-flags.mjs [--dry-run]
 */
import './env.mjs'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const dryRun = process.argv.includes('--dry-run')

async function syncAnimalFlags() {
  console.log('=== Sync Animal Presence Flags ===')
  console.log(dryRun ? '(DRY RUN - no changes will be made)\n' : '\n')

  // Get all completed images
  const { data: images, error: imagesError } = await supabase
    .from('images')
    .select('id, has_goats, has_hogs, has_cows, has_people, has_vehicles')
    .eq('detection_status', 'completed')

  if (imagesError) {
    console.error('Error fetching images:', imagesError.message)
    return
  }

  console.log(`Found ${images.length} completed images to check\n`)

  let updated = 0
  let skipped = 0
  let errors = 0

  for (const image of images) {
    // Count actual detections for each class
    const { data: detections, error: detectionsError } = await supabase
      .from('detections')
      .select('class')
      .eq('image_id', image.id)
      .is('deleted_at', null)

    if (detectionsError) {
      console.error(`Error fetching detections for ${image.id}:`, detectionsError.message)
      errors++
      continue
    }

    const classCounts = detections.reduce((acc, d) => {
      acc[d.class] = (acc[d.class] || 0) + 1
      return acc
    }, {})

    const shouldHaveGoats = (classCounts['goat'] || 0) > 0
    const shouldHaveHogs = (classCounts['hog'] || 0) > 0
    const shouldHaveCows = (classCounts['cow'] || 0) > 0
    const shouldHavePeople = (classCounts['person'] || 0) > 0
    const shouldHaveVehicles = (classCounts['vehicle'] || 0) > 0

    // Check if any flags need updating
    const needsUpdate =
      image.has_goats !== shouldHaveGoats ||
      image.has_hogs !== shouldHaveHogs ||
      image.has_cows !== shouldHaveCows ||
      image.has_people !== shouldHavePeople ||
      image.has_vehicles !== shouldHaveVehicles

    if (!needsUpdate) {
      skipped++
      continue
    }

    console.log(`Image ${image.id}:`)
    if (image.has_goats !== shouldHaveGoats) console.log(`  has_goats: ${image.has_goats} -> ${shouldHaveGoats}`)
    if (image.has_hogs !== shouldHaveHogs) console.log(`  has_hogs: ${image.has_hogs} -> ${shouldHaveHogs}`)
    if (image.has_cows !== shouldHaveCows) console.log(`  has_cows: ${image.has_cows} -> ${shouldHaveCows}`)
    if (image.has_people !== shouldHavePeople) console.log(`  has_people: ${image.has_people} -> ${shouldHavePeople}`)
    if (image.has_vehicles !== shouldHaveVehicles) console.log(`  has_vehicles: ${image.has_vehicles} -> ${shouldHaveVehicles}`)

    if (!dryRun) {
      const { error: updateError } = await supabase
        .from('images')
        .update({
          has_goats: shouldHaveGoats,
          has_hogs: shouldHaveHogs,
          has_cows: shouldHaveCows,
          has_people: shouldHavePeople,
          has_vehicles: shouldHaveVehicles,
        })
        .eq('id', image.id)

      if (updateError) {
        console.error(`  ERROR: ${updateError.message}`)
        errors++
        continue
      }
    }

    updated++
  }

  console.log('\n=== Summary ===')
  console.log(`Updated: ${updated}`)
  console.log(`Skipped (already correct): ${skipped}`)
  console.log(`Errors: ${errors}`)

  if (dryRun && updated > 0) {
    console.log('\nRun without --dry-run to apply changes')
  }
}

syncAnimalFlags().catch(console.error)
