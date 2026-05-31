import { getAIProvider } from './index'

export type CaptureContext = {
  categories: { id: string; name: string; kind: 'income' | 'expense' }[]
  wallets: { id: string; name: string }[]
  habits: { id: string; name: string }[]
}

export type CaptureIntent =
  | { module: 'budget'; type: 'expense' | 'income'; amount: number; categoryName: string | null; walletName: string | null; note: string | null }
  | { module: 'task'; title: string; scheduledDate: string | null }
  | { module: 'journal'; text: string }
  | { module: 'habit'; habitName: string }
  | { module: 'unknown'; reason: string }

function regexFallback(message: string): CaptureIntent | null {
  const m = message.trim().match(/^(\d+(?:\.\d+)?)\s+(.+)$/)
  if (m) {
    return { module: 'budget', type: 'expense', amount: parseFloat(m[1]), categoryName: null, walletName: null, note: m[2].trim() }
  }
  return null
}

// Parses a free-text phone message into a structured capture intent.
export async function parseCapture(message: string, ctx: CaptureContext): Promise<CaptureIntent> {
  const today = new Date().toISOString().split('T')[0]
  const cats = ctx.categories.map((c) => `${c.name} (${c.kind})`).join(', ') || 'none'
  const wallets = ctx.wallets.map((w) => w.name).join(', ') || 'none'
  const habits = ctx.habits.map((h) => h.name).join(', ') || 'none'

  const prompt = `You convert a short personal message into ONE structured JSON action for a life-tracking app.
Today is ${today}.

The user's EXPENSE/INCOME categories: ${cats}
The user's wallets: ${wallets}
The user's habits: ${habits}

Decide which module the message belongs to and return ONLY this JSON shape (no prose):
{
  "module": "budget" | "task" | "journal" | "habit" | "unknown",
  // budget:
  "type": "expense" | "income",
  "amount": number,
  "categoryName": string | null,   // MUST be one of the user's categories above, or null
  "walletName": string | null,     // MUST be one of the user's wallets above, or null
  "note": string | null,
  // task:
  "title": string,
  "scheduledDate": "YYYY-MM-DD" | null,
  // journal:
  "text": string,
  // habit:
  "habitName": string,             // MUST be one of the user's habits above
  // unknown:
  "reason": string
}

Rules:
- Money like "120 chai", "spent 50 on bus", "got 5000 allowance" => budget. Default type is expense; "got/received/earned/allowance/salary" => income.
- Pick the closest matching categoryName/walletName from the lists; if none fits, use null.
- "remind me", "task:", "todo" => task. Set scheduledDate ONLY if the user explicitly names a day or date (e.g. "tomorrow", "Monday", "June 2"); otherwise scheduledDate MUST be null.
- "journal:", "today i", feelings/reflections => journal (put the full text in "text").
- "done <habit>", "did <habit>", marking a habit done => habit (set habitName to the closest habit).
- Only include fields relevant to the chosen module; others may be omitted.

Message: "${message.replace(/"/g, "'")}"`

  try {
    const out = await getAIProvider().complete(
      [
        { role: 'system', content: 'You output only valid minified JSON. No markdown, no commentary.' },
        { role: 'user', content: prompt },
      ],
      { json: true, temperature: 0.1, maxTokens: 300 }
    )
    const parsed = JSON.parse(out) as CaptureIntent
    if (parsed && typeof parsed === 'object' && 'module' in parsed) return parsed
    throw new Error('malformed intent')
  } catch {
    const fb = regexFallback(message)
    if (fb) return fb
    return { module: 'unknown', reason: 'Could not understand the message.' }
  }
}
