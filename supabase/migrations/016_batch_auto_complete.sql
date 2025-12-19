-- Auto-complete batch when all images are processed
-- This trigger automatically marks a batch as 'completed' when processed_images reaches total_images
-- Eliminates the need for application-level batch completion checks

CREATE OR REPLACE FUNCTION check_batch_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- When processed_images reaches total_images and batch is still processing, auto-complete it
  IF NEW.processed_images >= NEW.total_images AND NEW.status = 'processing' THEN
    NEW.status := 'completed';
    NEW.completed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER batch_auto_complete
BEFORE UPDATE ON processing_batches
FOR EACH ROW
EXECUTE FUNCTION check_batch_completion();
