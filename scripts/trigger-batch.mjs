import { createClient } from '@supabase/supabase-js'
import { tasks } from '@trigger.dev/sdk/v3'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  // Get pending images
  const { data: images, error } = await supabase
    .from('images')
    .select('id, user_id, batch_id, detection_status')
    .eq('detection_status', 'pending')
    .limit(50)

  if (error) {
    console.error('Error fetching images:', error)
    process.exit(1)
  }

  console.log(`Found ${images.length} pending images`)

  if (images.length === 0) {
    console.log('No pending images to process')
    process.exit(0)
  }

  // Get user_id from first image
  const userId = images[0].user_id

  // Create a new batch for orphaned images
  const { data: batch, error: batchError } = await supabase
    .from('processing_batches')
    .insert({
      user_id: userId,
      status: 'processing',
      total_images: images.length,
      uploaded_images: images.length,
      processed_images: 0,
      successful_images: 0,
      failed_images: 0,
    })
    .select()
    .single()

  if (batchError) {
    console.error('Error creating batch:', batchError)
    process.exit(1)
  }

  console.log(`Created batch ${batch.id}`)

  // Update images with batch_id
  const imageIds = images.map(img => img.id)
  const { error: updateError } = await supabase
    .from('images')
    .update({ batch_id: batch.id })
    .in('id', imageIds)

  if (updateError) {
    console.error('Error updating images:', updateError)
    process.exit(1)
  }

  console.log(`Updated ${imageIds.length} images with batch_id`)

  // Trigger batch-process
  console.log(`Triggering batch-process for batch ${batch.id} with ${imageIds.length} images`)

  try {
    await tasks.trigger('batch-process', {
      batchId: batch.id,
      imageIds,
    })
    console.log(`✓ Triggered batch ${batch.id}`)
  } catch (err) {
    console.error(`✗ Failed to trigger batch:`, err.message)
  }

  console.log('Done!')
}

main()
