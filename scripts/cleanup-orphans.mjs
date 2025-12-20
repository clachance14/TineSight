import './env.mjs'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function cleanupOrphanImages() {
  // Get images with 'failed' detection_status
  const { data: orphans, error: fetchError } = await supabase
    .from('images')
    .select('id, file_path, detection_status')
    .eq('detection_status', 'failed')

  if (fetchError) {
    console.error('Error fetching orphans:', fetchError)
    return
  }

  console.log('Found', orphans.length, 'failed images to clean up')

  if (orphans.length > 0) {
    const orphanIds = orphans.map(i => i.id)

    // Delete from database
    const { error: deleteError } = await supabase
      .from('images')
      .delete()
      .in('id', orphanIds)

    if (deleteError) {
      console.error('Error deleting orphans:', deleteError)
    } else {
      console.log('Deleted', orphanIds.length, 'orphan images')
    }
  }

  // Check remaining images
  const { data: remaining } = await supabase
    .from('images')
    .select('id, detection_status')
    .limit(20)

  console.log('Remaining images:', remaining?.length || 0)
  if (remaining) {
    remaining.forEach(img => console.log('  -', img.id.slice(0,8) + '...', img.detection_status))
  }
}

cleanupOrphanImages()
