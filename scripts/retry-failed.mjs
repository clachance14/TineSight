import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Parse .env.local
const envFile = readFileSync('.env.local', 'utf-8')
const env = {}
envFile.split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) {
    env[key.trim()] = value.join('=').trim().replace(/\r/g, '').replace(/^["']|["']$/g, '')
  }
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function retryFailedImages() {
  // Get failed images
  const { data: failedImages, error: fetchError } = await supabase
    .from('images')
    .select('id, user_id, batch_id, detection_status')
    .eq('detection_status', 'failed')

  if (fetchError) {
    console.error('Error fetching failed images:', fetchError)
    return
  }

  console.log(`Found ${failedImages.length} failed images`)

  if (failedImages.length === 0) {
    console.log('No failed images to retry')
    return
  }

  // Reset to pending
  const imageIds = failedImages.map(img => img.id)
  const { error: updateError } = await supabase
    .from('images')
    .update({ detection_status: 'pending', error_message: null })
    .in('id', imageIds)

  if (updateError) {
    console.error('Error resetting images:', updateError)
    return
  }

  console.log(`Reset ${imageIds.length} images to pending`)

  // Get user_id from first image
  const userId = failedImages[0].user_id

  // Create a new batch
  const { data: batch, error: batchError } = await supabase
    .from('processing_batches')
    .insert({
      user_id: userId,
      status: 'pending',
      total_images: imageIds.length,
      uploaded_images: imageIds.length,
      processed_images: 0,
      successful_images: 0,
      failed_images: 0,
    })
    .select()
    .single()

  if (batchError) {
    console.error('Error creating batch:', batchError)
    return
  }

  console.log(`Created batch ${batch.id}`)

  // Update images with new batch_id
  const { error: batchUpdateError } = await supabase
    .from('images')
    .update({ batch_id: batch.id })
    .in('id', imageIds)

  if (batchUpdateError) {
    console.error('Error updating batch_id:', batchUpdateError)
    return
  }

  // Trigger batch-process via Trigger.dev
  const triggerToken = env.TRIGGER_SECRET_KEY

  console.log(`Triggering batch-process for ${imageIds.length} images...`)

  const response = await fetch('https://api.trigger.dev/api/v1/tasks/batch-process/trigger', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${triggerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      payload: {
        batchId: batch.id,
        imageIds: imageIds,
      }
    })
  })

  if (response.ok) {
    const result = await response.json()
    console.log('Batch triggered successfully:', result.id || 'OK')
  } else {
    const error = await response.text()
    console.log('Trigger API response:', response.status, error)
    console.log('\nNote: If trigger API fails, the Trigger.dev dev server will pick up the batch automatically.')
  }

  console.log('\nDone! Watch the Trigger.dev console for processing.')
}

retryFailedImages()
