import './env.mjs';
import { createClient } from '@supabase/supabase-js';
import { tasks } from '@trigger.dev/sdk/v3';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get pending images
const { data: pendingImages, error } = await supabase
  .from('images')
  .select('id, batch_id, user_id')
  .eq('detection_status', 'pending')
  .limit(10); // Start with 10 to test

if (error) {
  console.error('Error fetching pending images:', error);
  process.exit(1);
}

console.log('Found', pendingImages?.length || 0, 'pending images');

if (pendingImages?.length > 0) {
  // Create a temporary batch if needed
  let batchId = pendingImages[0].batch_id;

  if (!batchId) {
    const userId = pendingImages[0].user_id;
    const { data: newBatch, error: batchError } = await supabase
      .from('processing_batches')
      .insert({
        user_id: userId,
        status: 'processing',
        total_images: pendingImages.length,
        processed_images: 0,
        successful_images: 0,
        failed_images: 0,
      })
      .select('id')
      .single();

    if (batchError) {
      console.error('Failed to create batch:', batchError.message);
      process.exit(1);
    }
    batchId = newBatch.id;
    console.log('Created batch:', batchId);
  }

  // Trigger analyze-photo directly for each image
  console.log('Triggering analyze-photo for', pendingImages.length, 'images');

  for (const img of pendingImages) {
    try {
      await tasks.trigger('analyze-photo', { imageId: img.id, batchId });
      console.log('Triggered:', img.id);
    } catch (err) {
      console.error('Failed to trigger', img.id, ':', err.message);
    }
  }

  console.log('Done triggering jobs');
}
