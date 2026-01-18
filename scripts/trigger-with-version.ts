import './env.mjs';
import { generateFingerprint } from '../trigger/jobs/generate-fingerprint';

async function main() {
  // Try triggering with the dev worker's version
  const handle = await generateFingerprint.trigger(
    {
      detectionId: 'dbb674c1-c0c5-4b10-92da-86cfd8fd389f',
      userId: '2a15eafb-f5f1-4f7c-ae9f-8bc2c5ee0277',
    },
    {
      version: '20251227.27',  // Match dev worker version
    }
  );

  console.log("Run ID:", handle.id);
  console.log("Triggered with version: 20251227.27");
}

main().catch(console.error);
