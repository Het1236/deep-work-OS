import { createAdminClient } from '@/lib/supabase/admin'

export type Admin = ReturnType<typeof createAdminClient>

export function isIngestAuthorized(request: Request): boolean {
  const secret = process.env.INGEST_SECRET
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`
}

// Single-user app: the ingest owner is the one profile with Telegram linked.
export async function resolveIngestUser(admin: Admin): Promise<{ userId: string; chatId: string } | null> {
  const { data } = await admin.from('profiles').select('id,telegram_chat_id').not('telegram_chat_id', 'is', null).limit(2)
  if (!data || data.length !== 1) return null
  return { userId: data[0].id, chatId: String(data[0].telegram_chat_id) }
}
