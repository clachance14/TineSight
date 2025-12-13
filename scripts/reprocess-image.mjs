#!/usr/bin/env node
/**
 * Reprocess a single image through the Gemini pipeline
 * Clears existing detections and triggers fresh analysis
 *
 * Usage: node scripts/reprocess-image.mjs <imageId>
 */

import './env.mjs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function reprocessImage(imageId) {
  console.log(`\n🔄 Reprocessing image: ${imageId}\n`);

  // 1. Delete existing detections
  const { data: deletedDetections, error: deleteError } = await supabase
    .from('detections')
    .delete()
    .eq('image_id', imageId)
    .select('id');

  if (deleteError) {
    console.error('Failed to delete detections:', deleteError.message);
    return;
  }

  console.log(`✓ Deleted ${deletedDetections?.length || 0} existing detections`);

  // 2. Reset image status
  const { error: resetError } = await supabase
    .from('images')
    .update({
      detection_status: 'pending',
      has_deer: null,
      deer_count: null,
      analysis_notes: null,
      analyzed_at: null,
      classification: null,
      confidence: null,
      error_message: null,
      retry_count: 0
    })
    .eq('id', imageId);

  if (resetError) {
    console.error('Failed to reset image status:', resetError.message);
    return;
  }

  console.log('✓ Reset image status to pending');

  // 3. Get the image's batch_id
  const { data: image, error: imageError } = await supabase
    .from('images')
    .select('batch_id, file_path')
    .eq('id', imageId)
    .single();

  if (imageError || !image) {
    console.error('Failed to fetch image:', imageError?.message || 'Not found');
    return;
  }

  console.log(`✓ Image file: ${image.file_path}`);
  console.log(`✓ Batch ID: ${image.batch_id}`);

  // 4. Trigger reprocessing via API
  console.log('\n📡 Triggering analyze-photo job via API...');

  try {
    const response = await fetch('http://localhost:3000/api/photos/reprocess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId })
    });

    if (!response.ok) {
      // If API doesn't exist, print instructions for manual trigger
      console.log('\n⚠️  Reprocess API not available. Trigger manually:');
      console.log(`   Image is ready for reprocessing with batch_id: ${image.batch_id}`);
      console.log('   The Trigger.dev worker will pick it up if batch processing is running.\n');
    } else {
      const result = await response.json();
      console.log('✓ Triggered:', result);
    }
  } catch (err) {
    console.log('\n⚠️  Could not reach API. Image is reset and ready for reprocessing.');
    console.log('   Run the analyze-photo job manually or upload a new image.\n');
  }

  console.log('✅ Image ready for reprocessing!\n');
}

// Get image ID from command line
const imageId = process.argv[2];

if (!imageId) {
  // List recent images for convenience
  console.log('\nUsage: node scripts/reprocess-image.mjs <imageId>\n');
  console.log('Fetching recent images with detections...\n');

  const { data: images, error } = await supabase
    .from('images')
    .select('id, file_path, detection_status, deer_count')
    .not('detection_status', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Failed to fetch images:', error.message);
    process.exit(1);
  }

  if (images && images.length > 0) {
    console.log('Recent images:');
    images.forEach((img, i) => {
      console.log(`  ${i + 1}. ${img.id}`);
      console.log(`     Path: ${img.file_path}`);
      console.log(`     Status: ${img.detection_status}, Deer: ${img.deer_count ?? 'N/A'}`);
    });
    console.log('\n');
  } else {
    console.log('No processed images found.\n');
  }

  process.exit(0);
}

await reprocessImage(imageId);
