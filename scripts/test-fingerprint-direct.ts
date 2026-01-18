import './env.mjs';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { extractAntlerFingerprint } from '../lib/gemini/client';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const detectionId = 'dbb674c1-c0c5-4b10-92da-86cfd8fd389f';

  // Get detection with bbox and source image path
  const { data: detection, error } = await supabase
    .from('detections')
    .select(`
      id,
      crop_file_path,
      antler_fingerprint,
      species,
      sex,
      size_class,
      bbox_x,
      bbox_y,
      bbox_width,
      bbox_height,
      images!inner(id, file_path)
    `)
    .eq('id', detectionId)
    .single();

  if (error || !detection) {
    console.error('Detection not found:', error);
    return;
  }

  console.log('Detection:', {
    id: detection.id,
    species: detection.species,
    sex: detection.sex,
    sizeClass: detection.size_class,
    hasFingerprint: !!detection.antler_fingerprint,
    cropPath: detection.crop_file_path,
    bbox: {
      x: detection.bbox_x,
      y: detection.bbox_y,
      width: detection.bbox_width,
      height: detection.bbox_height
    }
  });

  if (detection.antler_fingerprint) {
    console.log('Detection already has fingerprint:', detection.antler_fingerprint);
    return;
  }

  // Get the source image
  const sourceImagePath = (detection.images as { file_path: string }).file_path;
  console.log('Source image path:', sourceImagePath);

  const { data: signedUrlData, error: signedError } = await supabase.storage
    .from('photos')
    .createSignedUrl(sourceImagePath, 300);

  if (signedError || !signedUrlData?.signedUrl) {
    console.error('Failed to get signed URL:', signedError);
    return;
  }

  console.log('Got signed URL, fetching source image...');

  // Fetch source image
  const response = await fetch(signedUrlData.signedUrl);
  const arrayBuffer = await response.arrayBuffer();
  const sourceBuffer = Buffer.from(arrayBuffer);

  console.log('Source image fetched, size:', sourceBuffer.length, 'bytes');

  // Get source image dimensions
  const sourceMetadata = await sharp(sourceBuffer).metadata();
  const imgWidth = sourceMetadata.width || 0;
  const imgHeight = sourceMetadata.height || 0;
  console.log('Source image dimensions:', imgWidth, 'x', imgHeight);

  // Crop the image using bounding box
  let { bbox_x, bbox_y, bbox_width, bbox_height } = detection;

  if (!bbox_x || !bbox_y || !bbox_width || !bbox_height) {
    console.error('Missing bounding box data');
    return;
  }

  // Clamp bounding box to image dimensions
  bbox_x = Math.max(0, Math.min(bbox_x, imgWidth - 1));
  bbox_y = Math.max(0, Math.min(bbox_y, imgHeight - 1));
  bbox_width = Math.min(bbox_width, imgWidth - bbox_x);
  bbox_height = Math.min(bbox_height, imgHeight - bbox_y);

  console.log('Cropping image with clamped bbox:', { bbox_x, bbox_y, bbox_width, bbox_height });

  const croppedBuffer = await sharp(sourceBuffer)
    .extract({
      left: bbox_x,
      top: bbox_y,
      width: bbox_width,
      height: bbox_height
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  console.log('Cropped image size:', croppedBuffer.length, 'bytes');
  console.log('Calling Gemini to extract fingerprint...');

  try {
    const { result: fingerprint, metrics } = await extractAntlerFingerprint(croppedBuffer);

    console.log('\n=== Fingerprint Result ===');
    console.log(JSON.stringify(fingerprint, null, 2));
    console.log('\n=== Gemini Metrics ===');
    console.log({
      model: metrics.modelUsed,
      tokens: metrics.totalTokens,
      duration: `${metrics.durationMs}ms`
    });

    // Update detection with fingerprint
    const { error: updateError } = await supabase
      .from('detections')
      .update({ antler_fingerprint: fingerprint })
      .eq('id', detectionId);

    if (updateError) {
      console.error('Failed to update detection:', updateError);
    } else {
      console.log('\n✅ Successfully updated detection with fingerprint!');
    }
  } catch (e) {
    console.error('Gemini error:', e);
  }
}

main().catch(console.error);
