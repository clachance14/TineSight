-- Migration: 009_detection_soft_delete.sql
ALTER TABLE detections
ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Index for filtering soft-deleted records
CREATE INDEX idx_detections_not_deleted ON detections (image_id)
WHERE deleted_at IS NULL;

-- Comment for clarity
COMMENT ON COLUMN detections.deleted_at IS 'Soft delete timestamp. Non-null means detection is hidden from views.';
