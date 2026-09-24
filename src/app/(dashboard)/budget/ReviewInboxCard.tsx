'use client'

// Auto-logging review inbox: SMS/emails that couldn't be logged confidently.
// Header doubles as a health check — a stale "last SMS" means MacroDroid stopped.
// Modal is portaled (transformed ancestors trap position:fixed).

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { InboundSignal } from '@/lib/types'
import { getReviewSignals, dismissSignal, getLastSignalTimes } from '@/lib/data'
import { Inbox, X, Check, MessageSquare, Mail } from 'lucide-react'

const ago = (iso: string | null) => {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${m}m ago`
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`
  return `${Math.round(m / 1440)}d ago`
}

export default function ReviewInboxCard({ userId, onChanged }: { userId: string; onChanged: () => void }) {
  const [items, setItems] = useState<InboundSignal[]>([])
  const [last, setLast] = useState<{ sms: string | null; email: string | null }>({ sms: null, email: null })
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const [rows, times] = await Promise.all([getReviewSignals(userId), getLastSignalTimes(userId)])
      setItems(rows); setLast(times)
    } catch (e) { console.error('review inbox load failed', e) }
  }, [userId])
  useEffect(() => { load() }, [load])

  const dismiss = async (id: string) => { await dismissSignal(id); await load(); onChanged() }

  return (
    <>
      <button className="bg-card rv-card" onClick={() => setOpen(true)}>
        <div className="rv-card-icon"><Inbox size={18} /></div>
        <div className="rv-card-main">
          <div className="rv-card-title">Auto-log review {items.length > 0 && <span className="rv-badge">{items.length}</span>}</div>
          <div className="rv-card-sub">📱 last SMS {ago(last.sms)} · ✉️ last email {ago(last.email)}</div>
        </div>
        <span className="rv-card-open">{items.length ? 'Review →' : 'All clear'}</span>
      </button>
      {open && createPortal(
        <div className="bg-overlay" onClick={() => setOpen(false)}>
          <div className="bg-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="bg-modal-head">
              <h3>Needs a look ({items.length})</h3>
              <button className="bg-icon-btn" onClick={() => setOpen(false)}><X size={16} /></button>
            </div>
            {items.length === 0 && <p className="rv-empty">All clear. Everything was logged automatically.</p>}
            <div className="rv-list">
              {items.map(s => (
                <div key={s.id} className="rv-item">
                  <div className="rv-item-head">
                    {s.kind === 'sms' ? <MessageSquare size={14} /> : <Mail size={14} />}
                    <span>{s.sender || s.kind}</span><span className="rv-time">{ago(s.received_at)}</span>
                  </div>
                  {s.subject && <div className="rv-subject">{s.subject}</div>}
                  <div className="rv-body">{s.body.slice(0, 280)}</div>
                  {s.error && <div className="rv-error">{s.error}</div>}
                  <div className="rv-actions">
                    <span className="rv-hint">{s.transaction_id ? 'Logged. Fix the category in Telegram or the Transactions tab.' : 'Not logged. Add it manually if needed.'}</span>
                    <button className="bg-btn bg-btn--sm" onClick={() => dismiss(s.id)}><Check size={14} /> Done</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
