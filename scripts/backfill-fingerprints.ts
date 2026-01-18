/**
 * Backfill fingerprints for existing trophy detections
 *
 * Usage: npx tsx scripts/backfill-fingerprints.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { tasks } from "@trigger.dev/sdk/v3";
import { generateFingerprint } from "../trigger/jobs/generate-fingerprint";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log("\n🔍 Finding trophy detections without fingerprints...\n");

  // Get trophy detections with their image's user_id using a join
  const { data: trophies, error } = await supabase
    .from("detections")
    .select(`
      id,
      image_id,
      size_class,
      crop_file_path,
      images!inner (
        user_id
      )
    `)
    .eq("size_class", "trophy")
    .is("antler_fingerprint", null)
    .not("crop_file_path", "is", null);

  if (error) {
    console.error("Error fetching detections:", error);
    process.exit(1);
  }

  if (!trophies || trophies.length === 0) {
    console.log("✓ No trophy detections need fingerprint generation.");
    return;
  }

  console.log(`Found ${trophies.length} trophy detections needing fingerprints:\n`);

  // Create map from joined data
  const imageUserMap = new Map<string, string>();
  for (const t of trophies) {
    const userId = (t.images as any)?.user_id;
    if (userId) {
      imageUserMap.set(t.image_id, userId);
    }
  }

  // Trigger fingerprint generation for each
  let successCount = 0;
  let failCount = 0;

  for (const detection of trophies) {
    const userId = imageUserMap.get(detection.image_id);
    if (!userId) {
      console.log(`  ⚠ Skipping ${detection.id.slice(0, 8)} - no user_id found`);
      failCount++;
      continue;
    }

    try {
      const handle = await tasks.trigger<typeof generateFingerprint>(
        "generate-fingerprint",
        { detectionId: detection.id, userId }
      );
      console.log(`  ✓ Triggered for ${detection.id.slice(0, 8)} (Run: ${handle.id})`);
      successCount++;
    } catch (err) {
      console.log(`  ✗ Failed for ${detection.id.slice(0, 8)}: ${err}`);
      failCount++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Triggered: ${successCount}`);
  console.log(`   Failed: ${failCount}`);
  console.log(`\nFingerprint jobs are now queued in Trigger.dev.`);
  console.log(`Check progress at: https://cloud.trigger.dev\n`);
}

main();
