import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Admin Supabase client with service role key.
 *
 * WARNING: This client bypasses Row-Level Security (RLS).
 * Only use in server-side contexts where administrative access is required.
 *
 * Use cases:
 * - Background jobs (Trigger.dev tasks)
 * - System-level operations
 * - Batch processing
 *
 * DO NOT use in API routes that handle user requests.
 * For user-scoped operations, use lib/supabase/server.ts instead.
 *
 * @module lib/supabase/admin
 */
export function createAdminClient(): SupabaseClient<Database> {
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const supabaseServiceKey = process.env['SUPABASE_SERVICE_ROLE_KEY']

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Missing Supabase environment variables. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
    )
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
