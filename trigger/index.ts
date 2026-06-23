/**
 * Trigger.dev job exports
 *
 * This file exports all background jobs for the Gemini Deer Pipeline.
 */

export { analyzePhoto } from './jobs/analyze-photo';
export { generateImageVariantsJob } from './jobs/generate-image-variants';
export { backfillVariants } from './jobs/backfill-variants';
export { compareDeer } from './jobs/compare-deer';
export { batchProcess } from './jobs/batch-process';
export { cleanupCancelledImages } from './jobs/cleanup-cancelled-images';
export { exportPhotosTask } from './jobs/export-photos';
export { cleanupExportsSchedule } from './jobs/cleanup-exports';
export { generateFingerprint } from './jobs/generate-fingerprint';
export { postCreationScan } from './jobs/post-creation-scan';
export { reverseReidScan } from './jobs/reverse-reid-scan';
export { clusterTrophyDetections } from './jobs/cluster-trophy-detections';
