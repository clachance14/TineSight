import './env.mjs'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function backfillClassification() {
  console.log('Starting classification backfill...')

  // Step 1: Find images with null classification that have detections
  const { data: imagesWithDetections, error: fetchError } = await supabase
    .from('images')
    .select(`
      id,
      classification,
      detections (
        id,
        confidence
      )
    `)
    .is('classification', null)

  if (fetchError) {
    console.error('Error fetching images:', fetchError)
    return
  }

  // Filter to only images that actually have detections
  const imagesToUpdate = imagesWithDetections.filter(
    img => img.detections && img.detections.length > 0
  )

  console.log(`Found ${imagesWithDetections.length} images with null classification`)
  console.log(`${imagesToUpdate.length} of these have detections and need updating`)

  if (imagesToUpdate.length === 0) {
    console.log('No images need backfilling')
    return
  }

  // Step 2: Update each image with classification and max confidence
  let updated = 0
  let failed = 0

  for (const image of imagesToUpdate) {
    const maxConfidence = Math.max(...image.detections.map(d => d.confidence || 0))

    const { error: updateError } = await supabase
      .from('images')
      .update({
        classification: 'animal',
        confidence: maxConfidence
      })
      .eq('id', image.id)

    if (updateError) {
      console.error(`Failed to update image ${image.id}:`, updateError.message)
      failed++
    } else {
      updated++
    }
  }

  console.log(`\nBackfill complete:`)
  console.log(`  Updated: ${updated}`)
  console.log(`  Failed: ${failed}`)

  // Step 3: Verify results
  const { data: verification } = await supabase
    .from('images')
    .select('id, classification, confidence')
    .not('classification', 'is', null)
    .limit(10)

  console.log(`\nSample of images with classification:`)
  verification?.forEach(img => {
    console.log(`  - ${img.id.slice(0,8)}... classification=${img.classification} confidence=${img.confidence?.toFixed(3)}`)
  })
}

backfillClassification()
