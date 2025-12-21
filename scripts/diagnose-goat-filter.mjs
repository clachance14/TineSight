import './env.mjs'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function diagnose() {
  // Check the specific image from the screenshot
  const imageId = '8b8e87da-1f44-4dce-9c5d-9137abed3854'

  console.log('=== Diagnostic Query for Goat Filter Bug ===\n')

  // Query the image
  const { data: image, error: imageError } = await supabase
    .from('images')
    .select('id, has_deer, has_goats, goat_count, deer_count, detection_status')
    .eq('id', imageId)
    .single()

  if (imageError) {
    console.error('Error fetching image:', imageError.message)
    return
  }

  console.log('Image flags:')
  console.log('  has_deer:', image.has_deer)
  console.log('  has_goats:', image.has_goats)
  console.log('  deer_count:', image.deer_count)
  console.log('  goat_count:', image.goat_count)
  console.log('  detection_status:', image.detection_status)
  console.log()

  // Query actual detections
  const { data: detections, error: detectionsError } = await supabase
    .from('detections')
    .select('id, class, detection_class, confidence')
    .eq('image_id', imageId)
    .is('deleted_at', null)

  if (detectionsError) {
    console.error('Error fetching detections:', detectionsError.message)
    return
  }

  console.log('Actual detections:')
  detections.forEach((d, i) => {
    console.log(`  ${i + 1}. class: ${d.class}, detection_class: ${d.detection_class}, confidence: ${d.confidence}`)
  })
  console.log()

  // Diagnosis
  console.log('=== DIAGNOSIS ===')
  const hasGoatDetection = detections.some(d => d.class === 'goat' || d.detection_class === 'goat')
  const hasDeerDetection = detections.some(d => d.class === 'deer' || d.detection_class === 'deer')

  if (image.has_deer && image.has_goats) {
    console.log('Bug 1 confirmed: Filter excludes photos with both deer AND other animals')
    console.log('Fix: Remove .eq("has_deer", false) from filter logic')
  } else if (hasGoatDetection && !image.has_goats) {
    console.log('Bug 2 confirmed: has_goats flag is false but goat detection exists')
    console.log('Fix: Derive has_* flags from detection counts, run data repair')
  } else if (!hasGoatDetection) {
    console.log('No goat detection found - check if detection was deleted or class changed')
  } else {
    console.log('Unexpected state - manual investigation needed')
  }

  console.log()
  console.log('Mixed photo scenario:', hasDeerDetection && hasGoatDetection ? 'YES' : 'NO')
}

diagnose().catch(console.error)
