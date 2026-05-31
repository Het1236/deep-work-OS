'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useUser } from '@/components/UserContext'
import { Sparkles, Loader2, Check, AlertCircle, CornerDownLeft } from 'lucide-react'

type Result = { ok: boolean; module: string; detail: string } | { error: string } | null

export default function QuickCapture() {
  const { triggerRefresh } = useUser()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = useCallback(() => { setOpen(false); setText(''); setResult(null); setBusy(false) }, [])

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

  async function submit() {
    const value = text.trim()
    if (!value || busy) return
    setBusy(true); setResult(null)
    try {
      const res = await fetch('/api/capture', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: value }),
      })
      const data = await res.json()
      if (!res.ok) { setResult({ error: data.error || 'Something went wrong' }); setBusy(false); return }
      setResult(data)
      setBusy(false)
      if (data.ok) {
        setText('')
        triggerRefresh?.()
        inputRef.current?.focus()
      }
    } catch {
      setResult({ error: 'Network error' }); setBusy(false)
    }
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="qc-overlay" onClick={close}>
      <div className="qc" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="qc-input-row">
          <Sparkles size={18} className="qc-spark" />
          <input
            ref={inputRef}
            className="qc-input"
            placeholder="Log anything… '120 chai', 'task: submit report', 'done gym'"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
            disabled={busy}
          />
          {busy ? <Loader2 size={16} className="qc-spin" /> : <kbd className="qc-kbd"><CornerDownLeft size={11} /></kbd>}
        </div>

        {result && 'error' in result && (
          <div className="qc-result qc-err"><AlertCircle size={14} /> {result.error}</div>
        )}
        {result && 'ok' in result && (
          <div className={`qc-result ${result.ok ? 'qc-ok' : 'qc-err'}`}>
            {result.ok ? <Check size={14} /> : <AlertCircle size={14} />} {result.detail}
          </div>
        )}
        {!result && (
          <div className="qc-hint">AI parses it to the right place — expense, task, journal, or habit.</div>
        )}
      </div>

      <style jsx>{`
        .qc-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(10, 8, 6, 0.42);
          backdrop-filter: blur(8px) saturate(1.1);
          -webkit-backdrop-filter: blur(8px) saturate(1.1);
          display: flex; align-items: flex-start; justify-content: center;
          padding-top: 16vh;
          animation: qcFade 0.18s ease both;
        }
        .qc {
          width: 100%; max-width: 540px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          overflow: hidden;
          animation: qcPop 0.22s cubic-bezier(0.2,0.7,0.3,1) both;
        }
        .qc-input-row { display: flex; align-items: center; gap: 12px; padding: 16px 18px; }
        :global(.qc-spark) { color: var(--accent); flex-shrink: 0; }
        :global(.qc-spin) { color: var(--text-tertiary); animation: qcSpin 1s linear infinite; flex-shrink: 0; }
        .qc-input { flex: 1; background: transparent; border: none; outline: none; color: var(--text-primary); font-size: 1rem; font-family: var(--font-sans); }
        .qc-input::placeholder { color: var(--text-tertiary); }
        .qc-kbd { color: var(--text-tertiary); border: 1px solid var(--border-default); border-radius: 5px; padding: 3px 6px; display: flex; }
        .qc-result { display: flex; align-items: center; gap: 8px; padding: 12px 18px; font-size: 0.8125rem; border-top: 1px solid var(--border-subtle); }
        .qc-ok { color: var(--status-success); }
        .qc-err { color: var(--status-danger); }
        .qc-hint { padding: 12px 18px; font-size: 0.75rem; color: var(--text-tertiary); border-top: 1px solid var(--border-subtle); }
        @keyframes qcFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes qcPop { from { opacity: 0; transform: translateY(-10px) scale(0.98); } to { opacity: 1; transform: none; } }
        @keyframes qcSpin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
      `}</style>
    </div>,
    document.body
  )
}
