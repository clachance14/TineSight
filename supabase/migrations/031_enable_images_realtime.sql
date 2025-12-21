-- ============================================================================
-- Enable Supabase Realtime for Images Table
-- ============================================================================
-- This migration enables real-time status updates for photo processing.
-- The useRealtimePhotos hook subscribes to UPDATE events on the images table.
-- ============================================================================

-- Add images table to the Supabase Realtime publication
-- This allows UPDATE events to be broadcast to subscribed clients
ALTER PUBLICATION supabase_realtime ADD TABLE images;

-- Set REPLICA IDENTITY to FULL for the images table
-- This ensures UPDATE event payloads include all column values (not just changed columns)
-- Required for the extractPhotoStatus() function to receive complete status data
ALTER TABLE images REPLICA IDENTITY FULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE images IS 'Uploaded photos with detection status tracking. Realtime-enabled for live status updates.';
