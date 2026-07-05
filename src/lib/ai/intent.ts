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
  | { module: 'meal'; description: string; mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink' | null }
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
{ "module":"meal", "description":string, "mealType":"breakfast"|"lunch"|"dinner"|"snack"|"drink"|null }
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
- "ate/had <food>", "breakfast:/lunch:/dinner: <food>", or a food-only message ("2 rotis and dal") => meal. description = the food text verbatim; mealType from the wording or time cue, else null. Food with a PRICE ("120 chai") stays a budget expense, not a meal — unless eating is explicit ("ate", "had").
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

// ── Meal macro estimation from a text description (capture path) ──
export type EstimatedMealItem = {
  name: string
  portion: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export async function estimateMealMacros(description: string): Promise<{ mealName: string; items: EstimatedMealItem[] }> {
  const prompt = `Estimate nutrition for this meal described by an Indian user: "${description.replace(/"/g, "'")}".
Itemize each distinct food/drink. For each, estimate a realistic portion (household measure + grams) and macros for that portion. Be conservative.
Return ONLY JSON: { "meal_name": string, "items": [ { "name": string, "portion": string, "kcal": number, "protein_g": number, "carbs_g": number, "fat_g": number } ] }`
  const out = await getAIProvider().complete(
    [
      { role: 'system', content: 'You output only valid minified JSON. No markdown, no commentary.' },
      { role: 'user', content: prompt },
    ],
    { json: true, temperature: 0.2, maxTokens: 700 },
  )
  const parsed = JSON.parse(out)
  const coerce = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0 }
  const items: EstimatedMealItem[] = (Array.isArray(parsed?.items) ? parsed.items : [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((o: any) => ({
      name: String(o?.name || '').slice(0, 120),
      portion: String(o?.portion || '').slice(0, 120),
      kcal: coerce(o?.kcal), protein_g: coerce(o?.protein_g), carbs_g: coerce(o?.carbs_g), fat_g: coerce(o?.fat_g),
    }))
    .filter((i: EstimatedMealItem) => i.name)
  if (items.length === 0) throw new Error('no items')
  return { mealName: String(parsed?.meal_name || description).slice(0, 120), items }
}
