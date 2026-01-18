import './env.mjs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase
  .from('detections')
  .select(`
    id,
    crop_file_path,
    bbox_x, bbox_y, bbox_width, bbox_height,
    image_id,
    images!inner(id, file_path)
  `)
  .eq('id', 'dbb674c1-c0c5-4b10-92da-86cfd8fd389f')
  .single();

if (error) {
  console.error('Error:', error);
} else {
  console.log('Detection:', JSON.stringify(data, null, 2));
}
