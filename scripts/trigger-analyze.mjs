#!/usr/bin/env node
/**
 * Trigger the analyze-photo job for a specific image
 *
 * Usage: node scripts/trigger-analyze.mjs <imageId>
 */

import './env.mjs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const imageId = process.argv[2];

if (!imageId) {
  console.error('Usage: node scripts/trigger-analyze.mjs <imageId>');
  process.exit(1);
}

console.log(`\n🎯 Triggering analyze-photo for: ${imageId}\n`);

// Get the image details first
const { data: image, error: fetchError } = await supabase
  .from('images')
  .select('id, file_path, detection_status, batch_id')
  .eq('id', imageId)
  .single();

if (fetchError || !image) {
  console.error('Failed to fetch image:', fetchError?.message || 'Not found');
  process.exit(1);
}

console.log('Image details:');
console.log(`  Path: ${image.file_path}`);
console.log(`  Status: ${image.detection_status}`);
console.log(`  Batch ID: ${image.batch_id || 'None'}`);

// Create a dummy batch if needed
let batchId = image.batch_id;
if (!batchId) {
  // Get user_id from image path (first segment is user_id)
  const userId = image.file_path.split('/')[0];

  const { data: batch, error: batchError } = await supabase
    .from('processing_batches')
    .insert({
      user_id: userId,
      total_images: 1,
      processed_images: 0,
      successful_images: 0,
      failed_images: 0,
      status: 'processing'
    })
    .select('id')
    .single();

  if (batchError) {
    console.error('Failed to create batch:', batchError.message);
    process.exit(1);
  }

  batchId = batch.id;
  console.log(`\n✓ Created batch: ${batchId}`);

  // Update image with batch_id
  await supabase
    .from('images')
    .update({ batch_id: batchId })
    .eq('id', imageId);
}

// Use Trigger.dev SDK to trigger the task
// We need to use dynamic import for ESM compatibility
const triggerSecretKey = process.env.TRIGGER_SECRET_KEY;

if (!triggerSecretKey) {
  console.error('\n❌ TRIGGER_SECRET_KEY not set in environment');
  console.log('\nFallback: Manually triggering via HTTP API...\n');

  // Try using the Trigger.dev API directly
  try {
    const response = await fetch('https://api.trigger.dev/api/v1/tasks/analyze-photo/trigger', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TRIGGER_API_KEY || ''}`,
      },
      body: JSON.stringify({
        payload: {
          imageId,
          batchId
        }
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✓ Task triggered successfully!');
      console.log('  Run ID:', result.id);
    } else {
      const error = await response.text();
      console.log('⚠️  HTTP API failed:', error);
      console.log('\nUse Trigger.dev dashboard to manually trigger the task.');
      console.log(`Task: analyze-photo`);
      console.log(`Payload: { imageId: "${imageId}", batchId: "${batchId}" }`);
    }
  } catch (err) {
    console.log('⚠️  Could not reach Trigger.dev API');
    console.log('\nUse Trigger.dev dashboard to manually trigger the task.');
    console.log(`Task: analyze-photo`);
    console.log(`Payload: { imageId: "${imageId}", batchId: "${batchId}" }`);
  }

  process.exit(0);
}

// If we have the secret key, try using the SDK
console.log('\n📡 Triggering via Trigger.dev SDK...');
try {
  // Dynamic import for the tasks module
  const { analyzePhoto } = await import('../trigger/index.js');

  const result = await analyzePhoto.trigger({
    imageId,
    batchId
  });

  console.log('✓ Task triggered successfully!');
  console.log('  Run ID:', result.id);
} catch (err) {
  console.error('Failed to trigger task:', err.message);
  console.log('\nUse Trigger.dev dashboard to manually trigger:');
  console.log(`Task: analyze-photo`);
  console.log(`Payload: { imageId: "${imageId}", batchId: "${batchId}" }`);
}
