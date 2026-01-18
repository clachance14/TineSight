import './env.mjs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase
  .from('detections')
  .select('id, antler_fingerprint, size_class')
  .eq('id', 'dbb674c1-c0c5-4b10-92da-86cfd8fd389f')
  .single();

if (error) {
  console.error('Error:', error);
} else {
  console.log('Fingerprint Status:');
  console.log('  Detection ID:', data.id);
  console.log('  Size Class:', data.size_class);
  console.log('  Has Fingerprint:', !!data.antler_fingerprint);
  if (data.antler_fingerprint) {
    console.log('\nFingerprint Summary:');
    console.log('  Score Class:', data.antler_fingerprint.scores?.score_class);
    console.log('  Gross Score:', data.antler_fingerprint.scores?.gross_score);
    console.log('  Net Score:', data.antler_fingerprint.scores?.net_score);
    console.log('  Total Points:', data.antler_fingerprint.measurements?.total_points);
    console.log('  Confidence:', data.antler_fingerprint.confidence?.overall);
  }
}
