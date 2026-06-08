import { parseCapture, type CaptureAction, type CaptureContext } from '@/lib/ai/intent'
import { formatINR } from '@/lib/finance'

// Works with either the admin (service-role) or an authed server client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any

const today = () => new Date().toISOString().split('T')[0]

export type UndoRef = { kind: 'tx' | 'task' | 'journal' | 'habit' | 'savings' | 'project' | 'goal'; id: string }
export type ApplyResult = { ok: boolean; module: string; detail: string; undo?: UndoRef }

function findByName<T extends { name: string }>(list: T[], q: string | null): T | undefined {
  if (!q) return undefined
  const s = q.toLowerCase()
  return list.find(i => i.name.toLowerCase() === s) ||
    list.find(i => i.name.toLowerCase().includes(s) || s.includes(i.name.toLowerCase()))
}

async function awardXp(client: Client, userId: string, eventType: string, xp: number) {
  try {
    await client.from('xp_events').insert({ user_id: userId, event_type: eventType, xp_awarded: xp, metadata: { source: 'capture' } })
    const { data: p } = await client.from('profiles').select('xp_total').eq('id', userId).single()
    const newTotal = (p?.xp_total || 0) + xp
    const level = Math.max(1, Math.floor(Math.sqrt(newTotal / 100)))
    await client.from('profiles').update({ xp_total: newTotal, level }).eq('id', userId)
  } catch { /* best effort */ }
}

export async function loadCaptureContext(client: Client, userId: string): Promise<CaptureContext> {
  const [cats, wallets, habits, projects, goals] = await Promise.all([
    client.from('finance_categories').select('id,name,kind').eq('user_id', userId).eq('is_archived', false),
    client.from('finance_accounts').select('id,name').eq('user_id', userId).eq('is_active', true),
    client.from('habits').select('id,name').eq('user_id', userId).eq('is_active', true),
    client.from('projects').select('id,title').eq('user_id', userId).neq('status', 'archived'),
    client.from('savings_goals').select('id,name,target_amount,is_achieved').eq('user_id', userId).eq('is_achieved', false),
  ])
  return {
    categories: (cats.data || []),
    wallets: (wallets.data || []),
    habits: (habits.data || []),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    projects: ((projects.data || []) as any[]).map(p => ({ id: p.id, name: p.title })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    savingsGoals: ((goals.data || []) as any[]).map(g => ({ id: g.id, name: g.name })),
  }
}

export async function applyAction(client: Client, userId: string, a: CaptureAction, ctx: CaptureContext): Promise<ApplyResult> {
  try {
    if (a.module === 'budget') {
      if (!a.amount || a.amount <= 0) return { ok: false, module: 'budget', detail: 'Need an amount' }
      const cat = a.categoryName ? findByName(ctx.categories.filter(c => c.kind === a.type), a.categoryName) : undefined
      const wallet = a.walletName ? findByName(ctx.wallets, a.walletName) : ctx.wallets[0]
      const { data, error } = await client.from('transactions').insert({
        user_id: userId, type: a.type, amount: a.amount, category_id: cat?.id ?? null,
        account_id: wallet?.id ?? null, to_account_id: null, txn_date: today(), note: a.note, recurring_id: null,
      }).select('id').single()
      if (error || !data) throw error || new Error('insert failed')
      const { count } = await client.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('txn_date', today())
      if ((count || 0) <= 1) await awardXp(client, userId, 'finance_log', 3)
      const sign = a.type === 'income' ? '+' : '−'
      const bits = [cat?.name || 'Uncategorized', wallet?.name].filter(Boolean).join(' · ')
      return { ok: true, module: 'budget', detail: `${sign}${formatINR(a.amount)} · ${bits}`, undo: { kind: 'tx', id: data.id } }
    }

    if (a.module === 'transfer') {
      const from = findByName(ctx.wallets, a.fromWallet)
      const to = findByName(ctx.wallets, a.toWallet)
      if (!from || !to || from.id === to.id) return { ok: false, module: 'transfer', detail: 'Need two different wallets for a transfer' }
      const { data, error } = await client.from('transactions').insert({
        user_id: userId, type: 'transfer', amount: a.amount, category_id: null,
        account_id: from.id, to_account_id: to.id, txn_date: today(), note: a.note, recurring_id: null,
      }).select('id').single()
      if (error || !data) throw error || new Error('insert failed')
      return { ok: true, module: 'transfer', detail: `${formatINR(a.amount)} · ${from.name} → ${to.name}`, undo: { kind: 'tx', id: data.id } }
    }

    if (a.module === 'task') {
      const project = a.projectName ? findByName(ctx.projects, a.projectName) : undefined
      const { data, error } = await client.from('tasks').insert({
        user_id: userId, title: a.title, status: 'todo', priority: 0, project_id: project?.id ?? null, scheduled_date: a.scheduledDate,
      }).select('id').single()
      if (error || !data) throw error || new Error('insert failed')
      const extra = [project ? `→ ${project.name}` : '', a.scheduledDate ? `(${a.scheduledDate})` : ''].filter(Boolean).join(' ')
      return { ok: true, module: 'task', detail: `${a.title}${extra ? ` ${extra}` : ''}`, undo: { kind: 'task', id: data.id } }
    }

    if (a.module === 'journal') {
      const { data: existing } = await client.from('journal_entries').select('id,reflection').eq('user_id', userId).eq('entry_date', today()).eq('entry_type', 'daily').maybeSingle()
      if (existing) {
        const merged = [existing.reflection, a.text].filter(Boolean).join('\n')
        await client.from('journal_entries').update({ reflection: merged }).eq('id', existing.id)
        return { ok: true, module: 'journal', detail: 'Added to today\'s journal' }
      }
      const { data, error } = await client.from('journal_entries').insert({
        user_id: userId, entry_type: 'daily', entry_date: today(), reflection: a.text, shutdown_done: false,
      }).select('id').single()
      if (error || !data) throw error || new Error('insert failed')
      await awardXp(client, userId, 'journal_entry', 10)
      return { ok: true, module: 'journal', detail: 'Journal saved', undo: { kind: 'journal', id: data.id } }
    }

    if (a.module === 'habit') {
      const habit = findByName(ctx.habits, a.habitName)
      if (!habit) return { ok: false, module: 'habit', detail: `No matching habit for "${a.habitName}"` }
      const { data: existing } = await client.from('habit_logs').select('id').eq('habit_id', habit.id).eq('log_date', today()).maybeSingle()
      if (existing) {
        await client.from('habit_logs').update({ completed: true }).eq('id', existing.id)
        return { ok: true, module: 'habit', detail: `${habit.name} done`, undo: { kind: 'habit', id: existing.id } }
      }
      const { data, error } = await client.from('habit_logs').insert({ habit_id: habit.id, user_id: userId, log_date: today(), completed: true }).select('id').single()
      if (error || !data) throw error || new Error('insert failed')
      await awardXp(client, userId, 'habit_complete', 5)
      return { ok: true, module: 'habit', detail: `${habit.name} done`, undo: { kind: 'habit', id: data.id } }
    }

    if (a.module === 'savings') {
      if (!a.amount || a.amount <= 0) return { ok: false, module: 'savings', detail: 'Need an amount' }
      const goal = a.goalName ? findByName(ctx.savingsGoals, a.goalName) : ctx.savingsGoals[0]
      if (!goal) return { ok: false, module: 'savings', detail: 'No matching savings goal' }
      const wallet = a.walletName ? findByName(ctx.wallets, a.walletName) : ctx.wallets[0]
      if (!wallet) return { ok: false, module: 'savings', detail: 'No wallet to move money from/to' }
      const isAdd = a.direction !== 'withdraw'

      const [{ data: gRow }, { data: gtx }] = await Promise.all([
        client.from('savings_goals').select('target_amount,is_achieved').eq('id', goal.id).single(),
        client.from('transactions').select('amount,account_id,to_account_id').eq('goal_id', goal.id),
      ])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const saved = ((gtx || []) as any[]).reduce((s, t) => s + (t.account_id ? Number(t.amount) : 0) - (t.to_account_id ? Number(t.amount) : 0), 0)
      if (!isAdd && a.amount > saved) return { ok: false, module: 'savings', detail: `Only ${formatINR(saved)} in ${goal.name}` }

      const { data, error } = await client.from('transactions').insert({
        user_id: userId, type: 'transfer', amount: a.amount, category_id: null,
        account_id: isAdd ? wallet.id : null, to_account_id: isAdd ? null : wallet.id,
        goal_id: goal.id, txn_date: today(), note: `Savings ${isAdd ? '→' : '←'} ${goal.name}`, recurring_id: null,
      }).select('id').single()
      if (error || !data) throw error || new Error('insert failed')

      const newSaved = saved + (isAdd ? a.amount : -a.amount)
      if (gRow && isAdd && !gRow.is_achieved && newSaved >= Number(gRow.target_amount)) {
        await client.from('savings_goals').update({ is_achieved: true }).eq('id', goal.id)
        await awardXp(client, userId, 'savings_funded', 20)
      } else if (gRow && !isAdd && gRow.is_achieved && newSaved < Number(gRow.target_amount)) {
        await client.from('savings_goals').update({ is_achieved: false }).eq('id', goal.id)
      }
      return { ok: true, module: 'savings', detail: `${formatINR(a.amount)} ${isAdd ? '→' : '←'} ${goal.name} · ${wallet.name}`, undo: { kind: 'tx', id: data.id } }
    }

    if (a.module === 'budget_set') {
      const cat = a.categoryName ? findByName(ctx.categories.filter(c => c.kind === 'expense'), a.categoryName) : undefined
      if (!cat) return { ok: false, module: 'budget_set', detail: `No expense category matching "${a.categoryName}"` }
      await client.from('finance_categories').update({ monthly_budget: a.amount }).eq('id', cat.id)
      return { ok: true, module: 'budget_set', detail: `Budget · ${cat.name} = ${formatINR(a.amount)}/mo` }
    }

    if (a.module === 'new_project') {
      if (!a.title?.trim()) return { ok: false, module: 'new_project', detail: 'Project needs a name' }
      const { data, error } = await client.from('projects').insert({ user_id: userId, title: a.title.trim(), status: 'upcoming' }).select('id').single()
      if (error || !data) throw error || new Error('insert failed')
      return { ok: true, module: 'new_project', detail: `Project created · ${a.title.trim()}`, undo: { kind: 'project', id: data.id } }
    }

    if (a.module === 'new_goal') {
      if (!a.title?.trim()) return { ok: false, module: 'new_goal', detail: 'Goal needs a name' }
      if (!a.targetAmount || a.targetAmount <= 0) return { ok: false, module: 'new_goal', detail: `Add a target, e.g. "save 5000 for ${a.title?.trim() || 'trip'}"` }
      const { data, error } = await client.from('savings_goals').insert({
        user_id: userId, name: a.title.trim(), target_amount: a.targetAmount, target_date: a.targetDate, is_achieved: false, sort_order: 0,
      }).select('id').single()
      if (error || !data) throw error || new Error('insert failed')
      return { ok: true, module: 'new_goal', detail: `Goal created · ${a.title.trim()} (${formatINR(a.targetAmount)})`, undo: { kind: 'goal', id: data.id } }
    }

    return { ok: false, module: 'unknown', detail: a.module === 'unknown' ? a.reason : 'Could not understand that part' }
  } catch (err) {
    return { ok: false, module: a.module, detail: err instanceof Error ? err.message : 'Failed to save' }
  }
}

// Parse + apply a whole message (possibly several actions).
export async function applyCapture(client: Client, userId: string, text: string): Promise<{ results: ApplyResult[] }> {
  const ctx = await loadCaptureContext(client, userId)
  const actions = await parseCapture(text, ctx)
  const results: ApplyResult[] = []
  for (const a of actions) results.push(await applyAction(client, userId, a, ctx))
  return { results }
}
