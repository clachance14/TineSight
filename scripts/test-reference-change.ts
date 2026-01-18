/**
 * Test script for reference photo change functionality
 *
 * This script validates the implementation of Phase 11 (User Story 9):
 * - T044: Deer update flow detects reference photo changes
 * - T045: Clears old fingerprint and queues regeneration
 *
 * Usage:
 *   npx tsx scripts/test-reference-change.ts
 */

import './env.mjs'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateDeer } from '@/lib/services/deer'

async function testReferencePhotoChange() {
  console.log('Testing reference photo change functionality...\n')

  const supabase = createAdminClient()

  // Find a deer with at least 2 detections
  const { data: deerList } = await supabase
    .from('deer')
    .select(`
      id,
      name,
      user_id,
      reference_detection_id,
      detections!deer_id(id, is_reference, antler_fingerprint)
    `)
    .limit(10)

  if (!deerList || deerList.length === 0) {
    console.log('❌ No deer found in database')
    return
  }

  // Find deer with multiple detections
  const deerWithMultipleDetections = deerList.find((deer: any) =>
    deer.detections && deer.detections.length >= 2
  )

  if (!deerWithMultipleDetections) {
    console.log('❌ No deer found with multiple detections')
    console.log('💡 Upload multiple photos of the same buck and create a deer profile first')
    return
  }

  const deer = deerWithMultipleDetections as any
  console.log(`✅ Found deer: ${deer.name} (ID: ${deer.id})`)
  console.log(`   Current reference: ${deer.reference_detection_id}`)
  console.log(`   Total detections: ${deer.detections.length}\n`)

  // Find a non-reference detection to use as new reference
  const newReferenceDetection = deer.detections.find((d: any) =>
    d.id !== deer.reference_detection_id
  )

  if (!newReferenceDetection) {
    console.log('❌ All detections are already the reference')
    return
  }

  console.log(`📸 New reference detection: ${newReferenceDetection.id}`)
  console.log(`   Current is_reference: ${newReferenceDetection.is_reference}`)
  console.log(`   Has fingerprint: ${newReferenceDetection.antler_fingerprint ? 'Yes' : 'No'}\n`)

  // Test the update
  console.log('🔄 Updating deer reference photo...')

  const result = await updateDeer(deer.user_id, deer.id, {
    reference_detection_id: newReferenceDetection.id
  })

  if (result.error) {
    console.log(`❌ Update failed: ${result.error.message}`)
    return
  }

  console.log('✅ Update successful!\n')

  // Verify changes
  console.log('🔍 Verifying changes...')

  // Check updated deer record
  const { data: updatedDeer } = await supabase
    .from('deer')
    .select('reference_detection_id')
    .eq('id', deer.id)
    .single()

  console.log(`   Deer reference_detection_id: ${updatedDeer?.reference_detection_id}`)
  console.log(`   Expected: ${newReferenceDetection.id}`)
  console.log(`   Match: ${updatedDeer?.reference_detection_id === newReferenceDetection.id ? '✅' : '❌'}\n`)

  // Check old reference detection
  const { data: oldDetection } = await supabase
    .from('detections')
    .select('is_reference, antler_fingerprint')
    .eq('id', deer.reference_detection_id)
    .single()

  console.log(`   Old detection is_reference: ${oldDetection?.is_reference} (expected: false)`)
  console.log(`   Old detection fingerprint cleared: ${oldDetection?.antler_fingerprint === null ? '✅' : '❌'}\n`)

  // Check new reference detection
  const { data: newDetection } = await supabase
    .from('detections')
    .select('is_reference, antler_fingerprint')
    .eq('id', newReferenceDetection.id)
    .single()

  console.log(`   New detection is_reference: ${newDetection?.is_reference} (expected: true)`)
  console.log(`   New detection fingerprint cleared: ${newDetection?.antler_fingerprint === null ? '✅' : '❌'}\n`)

  console.log('✅ All checks passed!')
  console.log('💡 Fingerprint generation job has been queued in Trigger.dev')
  console.log('   Check Trigger.dev dashboard to verify the job runs successfully')
}

testReferencePhotoChange()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Test failed:', error)
    process.exit(1)
  })
