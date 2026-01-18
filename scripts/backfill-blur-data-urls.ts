/**
 * Backfill blur data URLs for existing images
 *
 * Processes images in batches, downloading from storage and generating
 * color-accurate blur placeholders.
 *
 * Usage: npx tsx scripts/backfill-blur-data-urls.ts
 *
 * Options:
 *   --limit N    Process only N images (default: all)
 *   --batch N    Batch size for processing (default: 50)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { generateBlurDataUrl } from "../lib/image/blurhash";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Parse command line arguments
const args = process.argv.slice(2);
const limitIndex = args.indexOf("--limit");
const batchIndex = args.indexOf("--batch");
const maxImages = limitIndex !== -1 ? parseInt(args[limitIndex + 1], 10) : Infinity;
const batchSize = batchIndex !== -1 ? parseInt(args[batchIndex + 1], 10) : 50;

interface ImageRecord {
  id: string;
  file_path: string;
}

async function processImage(image: ImageRecord): Promise<boolean> {
  try {
    // Generate signed URL for image download
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from("photos")
      .createSignedUrl(image.file_path, 300); // 5 min expiry

    if (urlError || !signedUrlData) {
      console.log(`  ⚠ ${image.id.slice(0, 8)} - Failed to get signed URL`);
      return false;
    }

    // Download image
    const response = await fetch(signedUrlData.signedUrl);
    if (!response.ok) {
      console.log(`  ⚠ ${image.id.slice(0, 8)} - Download failed: ${response.status}`);
      return false;
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());

    // Generate blur data URL
    const blurDataUrl = await generateBlurDataUrl(imageBuffer);
    if (!blurDataUrl) {
      console.log(`  ⚠ ${image.id.slice(0, 8)} - Blur generation failed`);
      return false;
    }

    // Update database
    const { error: updateError } = await supabase
      .from("images")
      .update({ blur_data_url: blurDataUrl })
      .eq("id", image.id);

    if (updateError) {
      console.log(`  ⚠ ${image.id.slice(0, 8)} - Update failed: ${updateError.message}`);
      return false;
    }

    console.log(`  ✓ ${image.id.slice(0, 8)} - OK (${blurDataUrl.length} bytes)`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${image.id.slice(0, 8)} - Error: ${err}`);
    return false;
  }
}

async function main() {
  console.log("\n🖼️  Backfill Blur Data URLs\n");
  console.log(`Configuration:`);
  console.log(`  Batch size: ${batchSize}`);
  console.log(`  Max images: ${maxImages === Infinity ? "all" : maxImages}`);
  console.log("");

  // Count total images needing backfill
  const { count: totalCount, error: countError } = await supabase
    .from("images")
    .select("*", { count: "exact", head: true })
    .is("blur_data_url", null);

  if (countError) {
    console.error("Error counting images:", countError);
    process.exit(1);
  }

  const total = Math.min(totalCount ?? 0, maxImages);
  console.log(`Found ${totalCount} images without blur_data_url`);
  console.log(`Will process ${total} images\n`);

  if (total === 0) {
    console.log("✓ All images already have blur data URLs!");
    return;
  }

  let processed = 0;
  let successCount = 0;
  let failCount = 0;

  while (processed < total) {
    const currentBatch = Math.min(batchSize, total - processed);

    // Fetch batch of images
    const { data: images, error: fetchError } = await supabase
      .from("images")
      .select("id, file_path")
      .is("blur_data_url", null)
      .limit(currentBatch);

    if (fetchError) {
      console.error("Error fetching images:", fetchError);
      break;
    }

    if (!images || images.length === 0) {
      break;
    }

    console.log(`\nBatch ${Math.floor(processed / batchSize) + 1}: Processing ${images.length} images...`);

    // Process images in parallel (limited concurrency)
    const concurrencyLimit = 5;
    for (let i = 0; i < images.length; i += concurrencyLimit) {
      const chunk = images.slice(i, i + concurrencyLimit);
      const results = await Promise.all(chunk.map(processImage));

      results.forEach((success) => {
        if (success) {
          successCount++;
        } else {
          failCount++;
        }
      });
    }

    processed += images.length;
    console.log(`Progress: ${processed}/${total} (${Math.round((processed / total) * 100)}%)`);
  }

  console.log("\n📊 Summary:");
  console.log(`   Total processed: ${processed}`);
  console.log(`   Successful: ${successCount}`);
  console.log(`   Failed: ${failCount}`);
  console.log(`   Success rate: ${processed > 0 ? Math.round((successCount / processed) * 100) : 0}%`);
  console.log("");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
