/**
 * Trigger analyze-photo task directly using Trigger.dev SDK
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { tasks } from "@trigger.dev/sdk/v3";
import { analyzePhoto } from "../trigger/jobs/analyze-photo";

const imageIdArg = process.argv[2];
const batchIdArg = process.argv[3];

if (!imageIdArg || !batchIdArg) {
  console.error('Usage: npx tsx scripts/trigger-task.ts <imageId> <batchId>');
  process.exit(1);
}

const imageId: string = imageIdArg;
const batchId: string = batchIdArg;

console.log(`\n🎯 Triggering analyze-photo task...`);
console.log(`   Image ID: ${imageId}`);
console.log(`   Batch ID: ${batchId}\n`);

async function main() {
  try {
    const handle = await tasks.trigger<typeof analyzePhoto>(
      "analyze-photo",
      { imageId, batchId }
    );

    console.log('✓ Task triggered successfully!');
    console.log(`  Run ID: ${handle.id}`);
  } catch (error) {
    console.error('Failed to trigger task:', error);
  }
}

main();
