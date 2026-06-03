'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useUser } from '@/components/UserContext'
import {
  Sparkles, Loader2, AlertCircle, CornerDownLeft, Wallet, ListTodo, BookOpen, Flame,
  HelpCircle, ArrowLeftRight, PiggyBank, Target, FolderPlus,
} from 'lucide-react'

type ApiResp = { ok: boolean; results: { ok: boolean; module: string; detail: string }[] } | { error: string }
type HistItem = { id: number; module: string; detail: string; ok: boolean }

const MODULE_META: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  budget: { label: 'Budget', color: '#E89B5D', Icon: Wallet },
  transfer: { label: 'Transfer', color: '#5DC9E8', Icon: ArrowLeftRight },
  task: { label: 'Task', color: '#5B9BD5', Icon: ListTodo },
  journal: { label: 'Journal', color: '#9B7EDE', Icon: BookOpen },
  habit: { label: 'Habit', color: '#4CAF7D', Icon: Flame },
  savings: { label: 'Savings', color: '#4CAF7D', Icon: PiggyBank },
  budget_set: { label: 'Budget set', color: '#E89B5D', Icon: Wallet },
  new_project: { label: 'Project', color: '#5B9BD5', Icon: FolderPlus },
  new_goal: { label: 'Goal', color: '#F5A623', Icon: Target },
  unknown: { label: 'Unclear', color: 'var(--text-tertiary)', Icon: HelpCircle },
}

const EXAMPLES = [
  'allowance 500, 120 chai both from cash',
  'add "design logo" to Website project',
  'move 1000 from Bank to Cash',
  'add 500 to Goa trip',
  'budget 3000 for Food',
  'done gym, journal: great day',
]

export default function QuickCapture() {
  const { triggerRefresh } = useUser()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<HistItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const seq = useRef(0)

  const close = useCallback(() => { setOpen(false); setText(''); setError(''); setBusy(false); setHistory([]) }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setOpen(o => !o) }
      else if (e.key === 'Escape') close()
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('lifeos:capture', onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('lifeos:capture', onOpen) }
  }, [close])

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 20) }, [open])

  async function submit(value: string) {
    const v = value.trim()
    if (!v || busy) return
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/capture', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: v }),
      })
      const data: ApiResp = await res.json()
      if (!res.ok || 'error' in data) {
        setError(('error' in data && data.error) ? data.error : 'Something went wrong')
        setBusy(false)
        return
      }
      const items = (data.results || []).map(r => ({ id: ++seq.current, module: r.module, detail: r.detail, ok: r.ok }))
      setHistory(h => [...items.reverse(), ...h].slice(0, 8))
      setText('')
      if (data.ok) triggerRefresh?.()
      setBusy(false)
      inputRef.current?.focus()
    } catch {
      setError('Network error'); setBusy(false)
    }
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="qc-overlay" onClick={close}>
      <div className="qc" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="qc-accent" />

        <div className="qc-head">
          <div className="qc-badge"><Sparkles size={16} /></div>
          <div style={{ flex: 1 }}>
            <div className="qc-title">Quick Capture</div>
            <div className="qc-sub">Type anything — money, a task, a habit, a note. AI files it for you.</div>
          </div>
          <kbd className="qc-kbd">⌘J</kbd>
        </div>

        <div className="qc-input-row">
          {busy ? <Loader2 size={18} className="qc-spin" /> : <Sparkles size={18} className="qc-spark" />}
          <input
            ref={inputRef}
            className="qc-input"
            placeholder="e.g. add 'design new logo' to Website project"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(text) } }}
            disabled={busy}
          />
          <button className="qc-enter" onClick={() => submit(text)} disabled={busy || !text.trim()} title="Capture">
            <CornerDownLeft size={14} />
          </button>
        </div>

        {error && <div className="qc-error"><AlertCircle size={14} /> {error}</div>}

        {/* Example chips */}
        {history.length === 0 && !error && (
          <div className="qc-examples">
            {EXAMPLES.map(ex => (
              <button key={ex} className="qc-chip" onClick={() => { setText(ex); inputRef.current?.focus() }}>{ex}</button>
            ))}
          </div>
        )}

        {/* Captured results */}
        {history.length > 0 && (
          <div className="qc-history">
            {history.map(h => {
              const meta = MODULE_META[h.module] || MODULE_META.unknown
              const Icon = meta.Icon
              return (
                <div className="qc-hist-row" key={h.id}>
                  <span className="qc-hist-chip" style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 14%, transparent)` }}>
                    <Icon size={12} /> {meta.label}
                  </span>
                  <span className="qc-hist-detail" style={{ color: h.ok ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{h.detail}</span>
                </div>
              )
            })}
            <div className="qc-keepgoing">Keep typing to log more · Esc to close</div>
          </div>
        )}
      </div>

      <style jsx>{`
        .qc-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(10, 8, 6, 0.42);
          backdrop-filter: blur(8px) saturate(1.1);
          -webkit-backdrop-filter: blur(8px) saturate(1.1);
          display: flex; align-items: flex-start; justify-content: center;
          padding-top: 13vh;
          animation: qcFade 0.18s ease both;
        }
        .qc {
          position: relative;
          width: 100%; max-width: 560px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          overflow: hidden;
          animation: qcPop 0.22s cubic-bezier(0.2,0.7,0.3,1) both;
        }
        .qc-accent { height: 3px; background: var(--primary-gradient); }
        .qc-head { display: flex; align-items: center; gap: 12px; padding: 16px 18px 8px; }
        .qc-badge {
          width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
          background: var(--primary-gradient); color: var(--on-accent);
          display: flex; align-items: center; justify-content: center;
          box-shadow: var(--shadow-glow);
        }
        .qc-title { font-family: var(--font-display); font-size: 1.05rem; font-weight: 600; color: var(--text-primary); }
        .qc-sub { font-size: 0.75rem; color: var(--text-tertiary); margin-top: 1px; }
        .qc-kbd { font-size: 0.625rem; color: var(--text-tertiary); border: 1px solid var(--border-default); border-radius: 5px; padding: 3px 6px; font-family: var(--font-mono); }
        .qc-input-row { display: flex; align-items: center; gap: 12px; padding: 8px 18px 14px; }
        :global(.qc-spark) { color: var(--accent); flex-shrink: 0; }
        :global(.qc-spin) { color: var(--accent); animation: qcSpin 1s linear infinite; flex-shrink: 0; }
        .qc-input { flex: 1; background: transparent; border: none; outline: none; color: var(--text-primary); font-size: 1.0625rem; font-family: var(--font-sans); }
        .qc-input::placeholder { color: var(--text-tertiary); }
        .qc-enter {
          width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
          background: var(--accent-muted); color: var(--accent); border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center; transition: filter 0.15s ease;
        }
        .qc-enter:disabled { opacity: 0.4; cursor: default; }
        .qc-enter:not(:disabled):hover { filter: brightness(1.1); }
        .qc-error { display: flex; align-items: center; gap: 8px; padding: 12px 18px; font-size: 0.8125rem; color: var(--status-danger); border-top: 1px solid var(--border-subtle); }
        .qc-examples { display: flex; flex-wrap: wrap; gap: 7px; padding: 0 18px 18px; }
        .qc-chip {
          font-size: 0.75rem; color: var(--text-secondary);
          background: var(--bg-hover); border: 1px solid var(--border-subtle);
          border-radius: var(--radius-full); padding: 5px 11px; cursor: pointer;
          font-family: var(--font-sans); transition: all 0.15s ease;
        }
        .qc-chip:hover { border-color: var(--accent); color: var(--accent); }
        .qc-history { border-top: 1px solid var(--border-subtle); padding: 10px 18px 14px; display: flex; flex-direction: column; gap: 8px; max-height: 40vh; overflow-y: auto; }
        .qc-hist-row { display: flex; align-items: center; gap: 10px; animation: qcRow 0.25s ease both; }
        .qc-hist-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 0.6875rem; font-weight: 600; padding: 3px 8px; border-radius: var(--radius-full); flex-shrink: 0; }
        .qc-hist-detail { font-size: 0.8125rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .qc-keepgoing { font-size: 0.6875rem; color: var(--text-tertiary); padding-top: 2px; }
        @keyframes qcFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes qcPop { from { opacity: 0; transform: translateY(-10px) scale(0.98); } to { opacity: 1; transform: none; } }
        @keyframes qcRow { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
        @keyframes qcSpin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
      `}</style>
    </div>,
    document.body
  )
}
