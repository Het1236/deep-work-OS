import type { Admin } from './auth'

export async function sweepPendingEmails(_admin: Admin, _userId: string, _chatId: string): Promise<void> {
  // Filled in by the email ingest task.
}
