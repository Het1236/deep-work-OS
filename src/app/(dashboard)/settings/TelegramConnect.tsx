'use client'

import { useState, useEffect, useCallback } from 'react'
import { Send, Loader2, Check, Copy } from 'lucide-react'

export default function TelegramConnect() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [code, setCode] = useState('')
  const [botUsername, setBotUsername] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/telegram/link')
      const data = await res.json()
      setConnected(!!data.connected)
    } catch {
      setConnected(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function generate() {
    setLoading(true)
    try {
      const res = await fetch('/api/telegram/link', { method: 'POST' })
      const data = await res.json()
      setCode(data.code || '')
      setBotUsername(data.botUsername || null)
    } finally {
      setLoading(false)
    }
  }

  async function disconnect() {
    setLoading(true)
    try {
      await fetch('/api/telegram/link', { method: 'DELETE' })
      setCode('')
      await refresh()
    } finally {
      setLoading(false)
    }
  }

  const deepLink = botUsername && code ? `https://t.me/${botUsername}?start=${code}` : null

  return (
    <div className="settings-section card">
      <h3 className="settings-section-title"><Send size={16} /> Telegram Capture</h3>

      {connected === null ? (
        <div style={{ color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem' }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Checking…
        </div>
      ) : connected ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--status-success)', fontSize: '0.875rem', marginBottom: 'var(--space-lg)' }}>
            <Check size={16} /> Connected. Message your bot to log spends, tasks, journals & habits.
          </div>
          <button className="btn btn-ghost" style={{ color: 'var(--status-danger)' }} onClick={disconnect} disabled={loading}>
            {loading ? 'Disconnecting…' : 'Disconnect Telegram'}
          </button>
        </>
      ) : (
        <>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)' }}>
            Capture from your phone: connect a Telegram bot, then message it things like <code>120 chai</code> or <code>done gym</code>.
          </p>

          {!code ? (
            <button className="btn btn-primary" onClick={generate} disabled={loading}>
              {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
              {loading ? 'Generating…' : 'Connect Telegram'}
            </button>
          ) : (
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              {deepLink ? (
                <>
                  <p style={{ marginBottom: 8 }}>Tap to open your bot and connect:</p>
                  <a className="btn btn-primary" href={deepLink} target="_blank" rel="noopener noreferrer">
                    <Send size={14} /> Open bot & connect
                  </a>
                  <p style={{ marginTop: 12, color: 'var(--text-tertiary)' }}>
                    Or send this to the bot: <code>/start {code}</code>
                  </p>
                </>
              ) : (
                <>
                  <p style={{ marginBottom: 8 }}>Send this message to your Life OS bot on Telegram:</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{ background: 'var(--bg-surface)', padding: '6px 10px', borderRadius: 6, fontSize: '0.875rem' }}>/start {code}</code>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => { navigator.clipboard?.writeText(`/start ${code}`); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                    >
                      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </>
              )}
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={refresh}>I&apos;ve connected — refresh status</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
