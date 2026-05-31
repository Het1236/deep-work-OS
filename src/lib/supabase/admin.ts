import { createClient } from '@supabase/supabase-js'

// Server-only Supabase client using the service-role key. Bypasses RLS.
// NEVER import this from a client component.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase admin client not configured (missing URL or SUPABASE_SERVICE_ROLE_KEY).')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
