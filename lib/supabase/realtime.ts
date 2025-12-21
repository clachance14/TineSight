import type {
  RealtimePostgresChangesPayload,
  RealtimePostgresUpdatePayload,
} from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// Type alias for images table row
export type ImageRow = Database['public']['Tables']['images']['Row'];

// Type for UPDATE event payloads
export type ImageUpdatePayload = RealtimePostgresUpdatePayload<ImageRow>;

// Interface for photo status updates extracted from realtime events
export interface PhotoStatusUpdate {
  id: string;
  detection_status: string;
  has_deer: boolean | null;
  deer_count: number | null;
  classification: string | null;
  confidence: number | null;
  analyzed_at: string | null;
  error_message: string | null;
}

/**
 * Extracts photo status information from a Supabase realtime payload.
 * Returns null if the payload is not an UPDATE event or doesn't contain relevant data.
 *
 * @param payload - The realtime payload from Supabase subscription
 * @returns PhotoStatusUpdate object or null
 */
export function extractPhotoStatus(
  payload: RealtimePostgresChangesPayload<ImageRow>
): PhotoStatusUpdate | null {
  // Only process UPDATE events
  if (payload.eventType !== 'UPDATE') {
    return null;
  }

  const updatePayload = payload as ImageUpdatePayload;
  const newData = updatePayload.new;

  // Ensure we have the required data
  if (!newData || !newData.id) {
    return null;
  }

  return {
    id: newData.id,
    detection_status: newData.detection_status,
    has_deer: newData.has_deer,
    deer_count: newData.deer_count,
    classification: newData.classification,
    confidence: newData.confidence,
    analyzed_at: newData.analyzed_at,
    error_message: newData.error_message,
  };
}
