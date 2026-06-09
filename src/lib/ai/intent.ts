import { getAIProvider } from './index'

export type CaptureContext = {
  categories: { id: string; name: string; kind: 'income' | 'expense'; default_scope: 'self' | 'family' }[]
  wallets: { id: string; name: string }[]
  habits: { id: string; name: string }[]
  projects: { id: string; name: string }[]
  savingsGoals: { id: string; name: string }[]
}

export type CaptureAction =
  | { module: 'budget'; type: 'expense' | 'income'; amount: number; categoryName: string | null; walletName: string | null; scope: 'self' | 'family' | null; note: string | null }
  | { module: 'transfer'; amount: number; fromWallet: string | null; toWallet: string | null; note: string | null }
  | { module: 'task'; title: string; projectName: string | null; scheduledDate: string | null }
  | { module: 'journal'; text: string }
  | { module: 'habit'; habitName: string }
  | { module: 'savings'; goalName: string | null; amount: number; direction: 'add' | 'withdraw'; walletName: string | null; note: string | null }
  | { module: 'budget_set'; categoryName: string | null; amount: number }
  | { module: 'new_project'; title: string }
  | { module: 'new_goal'; title: string; targetAmount: number | null; targetDate: string | null }
  | { module: 'unknown'; reason: string }

function regexFallback(message: string): CaptureAction[] | null {
  const m = message.trim().match(/^(\d+(?:\.\d+)?)\s+(.+)$/)
  if (m) return [{ module: 'budget', type: 'expense', amount: parseFloat(m[1]), categoryName: null, walletName: null, scope: null, note: m[2].trim() }]
  return null
}

// Parses a free-text message (possibly several actions) into structured actions.
export async function parseCapture(message: string, ctx: CaptureContext): Promise<CaptureAction[]> {
  const today = new Date().toISOString().split('T')[0]
  const cats = ctx.categories.map((c) => `${c.name} (${c.kind})`).join(', ') || 'none'
  const wallets = ctx.wallets.map((w) => w.name).join(', ') || 'none'
  const habits = ctx.habits.map((h) => h.name).join(', ') || 'none'
  const projects = ctx.projects.map((p) => p.name).join(', ') || 'none'
  const goals = ctx.savingsGoals.map((g) => g.name).join(', ') || 'none'

  const prompt = `You turn a personal message (which may contain MULTIPLE actions) into a JSON array of structured actions for a life-tracking app.
Today is ${today}.

The user's EXPENSE/INCOME categories: ${cats}
The user's wallets: ${wallets}
The user's habits: ${habits}
The user's projects: ${projects}
The user's savings goals: ${goals}

Return ONLY this JSON object (no prose): { "actions": [ <action>, ... ] }
Each <action> is exactly ONE of these shapes:
{ "module":"budget", "type":"expense"|"income", "amount":number, "categoryName":string|null, "walletName":string|null, "scope":"self"|"family"|null, "note":string|null }
{ "module":"transfer", "amount":number, "fromWallet":string|null, "toWallet":string|null, "note":string|null }
{ "module":"task", "title":string, "projectName":string|null, "scheduledDate":"YYYY-MM-DD"|null }
{ "module":"journal", "text":string }
{ "module":"habit", "habitName":string }
{ "module":"savings", "goalName":string|null, "amount":number, "direction":"add"|"withdraw", "walletName":string|null, "note":string|null }
{ "module":"budget_set", "categoryName":string|null, "amount":number }
{ "module":"new_project", "title":string }
{ "module":"new_goal", "title":string, "targetAmount":number|null, "targetDate":"YYYY-MM-DD"|null }
{ "module":"unknown", "reason":string }

Rules:
- SPLIT compound messages into multiple actions. Example: "allowance 500 from father, 420 fuel both from cash" => [ {budget income 500, categoryName closest to "Allowance", walletName "Cash", note "from father"}, {budget expense 420, categoryName closest to "Fuel"/"Travel", walletName "Cash", note "fuel"} ]. Apply shared context (e.g. "both from cash") to EVERY money action it refers to.
- categoryName / walletName / projectName / goalName / habitName MUST be the closest match from the user's lists above, or null if nothing fits.
- Money: bare "120 chai" or "spent/paid/bought" => expense; "got/received/earned/allowance/salary/income/refund" => income.
- For expenses, set "scope":"family" when it's a family/household spend (e.g. "groceries for home", "family dinner", "for mom"), "self" when explicitly personal ("for myself"), otherwise null (it will inherit the category's default).
- "move/transfer X from A to B" => transfer.
- "save/put/add X to <goal>" => savings with direction "add". "withdraw/remove/take out/pull X from <goal>" => savings with direction "withdraw". Set walletName to the wallet mentioned ("from cash", "to bank") or null.
- "set budget"/"budget 3000 for Food" => budget_set.
- "new project"/"start project X" => new_project. "new goal"/"save for X" that names a TARGET amount => new_goal.
- "task:"/"todo"/"remind me"/"add ... to <project>" => task. projectName only if a project is named; scheduledDate only if an explicit day/date is named (e.g. "tomorrow", "Monday", "June 2"), else null.
- "journal:"/"today i"/reflections => journal. "done <habit>"/"did <habit>" => habit.
- If a part is truly unclear, emit one { "module":"unknown", "reason": "..." } for it.
Output ONLY the JSON object.

Message: "${message.replace(/"/g, "'")}"`

  try {
    const out = await getAIProvider().complete(
      [
        { role: 'system', content: 'You output only valid minified JSON. No markdown, no commentary.' },
        { role: 'user', content: prompt },
      ],
      { json: true, temperature: 0.1, maxTokens: 800 }
    )
    const parsed = JSON.parse(out)
    const actions = Array.isArray(parsed) ? parsed : parsed?.actions
    if (Array.isArray(actions) && actions.length > 0) return actions as CaptureAction[]
    throw new Error('no actions')
  } catch {
    const fb = regexFallback(message)
    if (fb) return fb
    return [{ module: 'unknown', reason: 'Could not understand the message.' }]
  }
}
