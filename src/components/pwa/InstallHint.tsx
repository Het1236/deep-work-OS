'use client'

import { useEffect, useState } from 'react'
import { X, Share } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BIPEvent = any

export default function InstallHint() {
  const [visible, setVisible] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [deferred, setDeferred] = useState<BIPEvent | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem('installHintDismissed') === '1') return
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    if (standalone) return

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(ios)

    const onBIP = (e: BIPEvent) => { e.preventDefault(); setDeferred(e); setVisible(true) }
    window.addEventListener('beforeinstallprompt', onBIP)
    if (ios) setVisible(true)
    return () => window.removeEventListener('beforeinstallprompt', onBIP)
  }, [])

  if (!visible) return null

  function dismiss() {
    localStorage.setItem('installHintDismissed', '1')
    setVisible(false)
  }

  async function install() {
    if (deferred) { deferred.prompt(); await deferred.userChoice; dismiss() }
  }

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 9998, maxWidth: 480, margin: '0 auto',
      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 12,
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      <div style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
        {isIOS ? (
          <>Install Life OS: tap <Share size={13} style={{ verticalAlign: 'middle' }} /> then &ldquo;Add to Home Screen&rdquo;.</>
        ) : (
          <>Install Life OS on your device for quick access.</>
        )}
      </div>
      {!isIOS && deferred && (
        <button onClick={install} style={{ background: 'var(--primary-gradient)', color: '#0a0a0a', border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>Install</button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
    </div>
  )
}
