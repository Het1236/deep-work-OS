# Life OS Foundation (Phase 0 + Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the app deployable + installable on your phone (Phase 0), and fix the broken AI behind a clean pluggable provider (Phase 1).

**Architecture:** Phase 0 migrates the deprecated `middleware`→`proxy`, adds a Next 16 `app/manifest.ts`, a hand-rolled `public/sw.js` offline shell, generated PWA icons, and a guided Vercel deploy. Phase 1 extracts a `src/lib/ai/` provider abstraction (Gemini default, Groq alternative — both free) and routes the existing AI Report through it with graceful no-key handling.

**Tech Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Supabase · Vercel (free) · Gemini/Groq REST · `sharp` (dev, icon generation).

**Spec:** `docs/superpowers/specs/2026-05-30-life-os-upgrade-proposal.md`

> **No test framework:** verify with `npx tsc --noEmit`, `npm run build`, and manual checks — matching the existing repo convention.
> **Next 16:** APIs below were taken from `node_modules/next/dist/docs/` (PWA guide + `proxy.md`). Re-consult if anything fails.

---

# PHASE 0 — Deploy + Mobile Foundation

## Task 0.1: Migrate `middleware` → `proxy`

**Files:**
- Rename: `src/middleware.ts` → `src/proxy.ts`
- Modify: the function name + matcher inside it

- [ ] **Step 1: Run the official codemod**

Run: `npx @next/codemod@canary middleware-to-proxy .`
Expected: it renames `src/middleware.ts` to `src/proxy.ts` and `export async function middleware` to `export async function proxy`.

If the codemod cannot run offline, do it manually: rename the file and change the function name (see Step 2 for the final file).

- [ ] **Step 2: Set the final `src/proxy.ts` contents** (preserves existing auth logic, updates the matcher to let PWA assets + API webhooks through)

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Protected routes
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/signup') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect logged-in users away from auth pages
  if (
    user &&
    (request.nextUrl.pathname.startsWith('/login') ||
      request.nextUrl.pathname.startsWith('/signup'))
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Exclude API routes (they do their own auth), PWA assets, and static files
    '/((?!api|manifest.webmanifest|sw.js|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|js)$).*)',
  ],
}
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` passes; `npm run build` no longer prints the "middleware is deprecated" warning.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: migrate middleware to proxy (Next 16); allow PWA assets + api through"
```

---

## Task 0.2: PWA app icon + generation script

**Files:**
- Create: `public/app-icon.svg`
- Create: `scripts/generate-icons.mjs`
- Add dev dependency: `sharp`
- Generates: `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/apple-touch-icon.png`

- [ ] **Step 1: Create `public/app-icon.svg`** (dark tile + mint mark, with safe padding for maskable)

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0a0a0a"/>
  <g transform="translate(256,256)">
    <circle r="150" fill="none" stroke="#96fac2" stroke-width="20" opacity="0.25"/>
    <path d="M -70 40 L -20 -40 L 30 20 L 80 -60" fill="none" stroke="#96fac2"
      stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="80" cy="-60" r="16" fill="#96fac2"/>
  </g>
</svg>
```

- [ ] **Step 2: Install sharp (dev only)**

Run: `npm install -D sharp`
Expected: added to devDependencies.

- [ ] **Step 3: Create `scripts/generate-icons.mjs`**

```js
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const pub = join(here, '..', 'public')
const svg = readFileSync(join(pub, 'app-icon.svg'))

const targets = [
  [192, 'icon-192.png'],
  [512, 'icon-512.png'],
  [512, 'icon-maskable-512.png'],
  [180, 'apple-touch-icon.png'],
]

for (const [size, name] of targets) {
  await sharp(svg).resize(size, size).png().toFile(join(pub, name))
  console.log('wrote', name)
}
```

- [ ] **Step 4: Generate the icons**

Run: `node scripts/generate-icons.mjs`
Expected output: `wrote icon-192.png` … `wrote apple-touch-icon.png`; the four PNGs exist in `public/`.

- [ ] **Step 5: Commit**

```bash
git add public/app-icon.svg public/icon-192.png public/icon-512.png public/icon-maskable-512.png public/apple-touch-icon.png scripts/generate-icons.mjs package.json package-lock.json
git commit -m "feat(pwa): app icon + sharp icon generation script"
```

---

## Task 0.3: Web App Manifest

**Files:**
- Create: `src/app/manifest.ts`

- [ ] **Step 1: Create `src/app/manifest.ts`**

```ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Life OS',
    short_name: 'Life OS',
    description: 'Your personal life operating system — deep work, habits, money, goals.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    orientation: 'portrait-primary',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
```

- [ ] **Step 2: Verify** — `npm run dev`, open `http://localhost:3000/manifest.webmanifest` → returns the JSON above.

- [ ] **Step 3: Commit**

```bash
git add src/app/manifest.ts
git commit -m "feat(pwa): web app manifest"
```

---

## Task 0.4: Service worker, registrar, install hint, viewport, headers

**Files:**
- Create: `public/sw.js`
- Create: `src/components/pwa/ServiceWorkerRegistrar.tsx`
- Create: `src/components/pwa/InstallHint.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `next.config.ts`

- [ ] **Step 1: Create `public/sw.js`** (offline shell; never touches API/auth)

```js
const CACHE = 'life-os-v1'
const APP_SHELL = ['/']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/auth')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () =>
        (await caches.match(request)) ||
        (await caches.match('/')) ||
        new Response('<h1>Offline</h1><p>Reconnect to use Life OS.</p>', {
          headers: { 'Content-Type': 'text/html' },
        })
      )
    )
  }
})
```

- [ ] **Step 2: Create `src/components/pwa/ServiceWorkerRegistrar.tsx`**

```tsx
'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        /* registration failures are non-fatal */
      })
    }
  }, [])
  return null
}
```

- [ ] **Step 3: Create `src/components/pwa/InstallHint.tsx`** (dismissible; iOS gets manual instructions, others get the native prompt)

```tsx
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
          <>Install Life OS: tap <Share size={13} style={{ verticalAlign: 'middle' }} /> then “Add to Home Screen”.</>
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
```

- [ ] **Step 4: Update `src/app/layout.tsx`** to add viewport, PWA metadata, and mount the two components

```tsx
import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/pwa/ServiceWorkerRegistrar";
import InstallHint from "@/components/pwa/InstallHint";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Life OS — The Architecture of Silence",
  description:
    "Your personal life operating system — deep work, habits, money, goals.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Life OS" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable} ${GeistMono.variable}`}>
      <body>
        {children}
        <ServiceWorkerRegistrar />
        <InstallHint />
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Update `next.config.ts`** to serve `sw.js` with correct headers

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 6: Verify** — `npx tsc --noEmit` passes; `npm run build` succeeds. In `npm run dev`, open the app, DevTools → Application → Service Workers shows `sw.js` activated, and Manifest shows "Life OS" + icons with no errors.

- [ ] **Step 7: Commit**

```bash
git add public/sw.js src/components/pwa/ServiceWorkerRegistrar.tsx src/components/pwa/InstallHint.tsx src/app/layout.tsx next.config.ts
git commit -m "feat(pwa): service worker, install hint, viewport + sw headers"
```

---

## Task 0.5: Deploy to Vercel (guided — Het performs, Claude verifies)

**This task is manual** (needs your Vercel/GitHub account). Claude walks you through and verifies.

- [ ] **Step 1: Push `master` to GitHub** (if not already): `git push origin master` (Claude will ask before pushing).
- [ ] **Step 2:** At vercel.com → "Add New Project" → import the repo. Framework auto-detects Next.js. Leave build settings default.
- [ ] **Step 3: Set Environment Variables** in Vercel (Production + Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GEMINI_API_KEY` (Phase 1), and after first deploy set `NEXT_PUBLIC_APP_URL` to the assigned `*.vercel.app` URL.
- [ ] **Step 4: Deploy.** Note the live URL.
- [ ] **Step 5:** In Supabase dashboard → Authentication → URL Configuration, add the Vercel URL to Site URL + Redirect URLs.
- [ ] **Step 6: Verify on phone** — open the Vercel URL on your phone browser, log in, then "Add to Home Screen"; confirm it launches full-screen.

**No commit** (deploy is external).

---

# PHASE 1 — AI Foundation (cleanup)

## Task 1.1: AI provider types

**Files:**
- Create: `src/lib/ai/types.ts`

- [ ] **Step 1: Create the file**

```ts
export type AIRole = 'system' | 'user' | 'assistant'
export type AIMessage = { role: AIRole; content: string }

export type AICompletionOptions = {
  json?: boolean          // request strict JSON output
  temperature?: number
  maxTokens?: number
}

export interface AIProvider {
  readonly name: string
  complete(messages: AIMessage[], options?: AICompletionOptions): Promise<string>
}

// Thrown when the selected provider has no API key configured.
export class AINotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AINotConfiguredError'
  }
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` passes. Commit:

```bash
git add src/lib/ai/types.ts
git commit -m "feat(ai): provider interface + types"
```

---

## Task 1.2: Gemini adapter

**Files:**
- Create: `src/lib/ai/gemini.ts`

- [ ] **Step 1: Create the file**

```ts
import type { AIMessage, AICompletionOptions, AIProvider } from './types'
import { AINotConfiguredError } from './types'

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

export function createGeminiProvider(): AIProvider {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    throw new AINotConfiguredError(
      'GEMINI_API_KEY is not set. Add it to your environment to enable AI features.'
    )
  }
  return {
    name: 'Gemini',
    async complete(messages: AIMessage[], options: AICompletionOptions = {}) {
      // Gemini has no dedicated system role — fold system text into the first user turn.
      const systemText = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
      const turns = messages.filter((m) => m.role !== 'system')
      const contents = turns.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))
      if (systemText && contents.length > 0) {
        contents[0].parts[0].text = `${systemText}\n\n${contents[0].parts[0].text}`
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature: options.temperature ?? 0.7,
              maxOutputTokens: options.maxTokens ?? 2048,
              ...(options.json ? { responseMimeType: 'application/json' } : {}),
            },
          }),
        }
      )
      if (!res.ok) {
        const detail = await res.text()
        throw new Error(`Gemini API error ${res.status}: ${detail.slice(0, 300)}`)
      }
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) throw new Error('Gemini returned an empty response')
      return text as string
    },
  }
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` passes. Commit:

```bash
git add src/lib/ai/gemini.ts
git commit -m "feat(ai): Gemini adapter"
```

---

## Task 1.3: Groq adapter

**Files:**
- Create: `src/lib/ai/groq.ts`

- [ ] **Step 1: Create the file**

```ts
import type { AIMessage, AICompletionOptions, AIProvider } from './types'
import { AINotConfiguredError } from './types'

const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

export function createGroqProvider(): AIProvider {
  const key = process.env.GROQ_API_KEY
  if (!key) {
    throw new AINotConfiguredError(
      'GROQ_API_KEY is not set. Add it to your environment to enable AI features.'
    )
  }
  return {
    name: 'Groq',
    async complete(messages: AIMessage[], options: AICompletionOptions = {}) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 2048,
          ...(options.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      })
      if (!res.ok) {
        const detail = await res.text()
        throw new Error(`Groq API error ${res.status}: ${detail.slice(0, 300)}`)
      }
      const data = await res.json()
      const text = data?.choices?.[0]?.message?.content
      if (!text) throw new Error('Groq returned an empty response')
      return text as string
    },
  }
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` passes. Commit:

```bash
git add src/lib/ai/groq.ts
git commit -m "feat(ai): Groq adapter (OpenAI-compatible)"
```

---

## Task 1.4: Provider factory

**Files:**
- Create: `src/lib/ai/index.ts`

- [ ] **Step 1: Create the file**

```ts
import type { AIProvider } from './types'
import { createGeminiProvider } from './gemini'
import { createGroqProvider } from './groq'

export * from './types'

// Selects the provider from AI_PROVIDER env (default: gemini).
export function getAIProvider(): AIProvider {
  const choice = (process.env.AI_PROVIDER || 'gemini').toLowerCase()
  switch (choice) {
    case 'groq':
      return createGroqProvider()
    case 'gemini':
    default:
      return createGeminiProvider()
  }
}

// True when the selected provider has a key set (for UI to show/hide AI features).
export function isAIConfigured(): boolean {
  const choice = (process.env.AI_PROVIDER || 'gemini').toLowerCase()
  return choice === 'groq' ? !!process.env.GROQ_API_KEY : !!process.env.GEMINI_API_KEY
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` passes. Commit:

```bash
git add src/lib/ai/index.ts
git commit -m "feat(ai): provider factory (getAIProvider) + isAIConfigured"
```

---

## Task 1.5: Route AI Report through the provider

**Files:**
- Modify: `src/app/api/ai-report/route.ts`

- [ ] **Step 1: Add the import** at the top (after the existing imports)

```ts
import { getAIProvider, AINotConfiguredError } from '@/lib/ai'
```

- [ ] **Step 2: Replace the entire provider/try-catch block** — everything from `let reportText = ''` (currently line ~118) through the end of the function (the final `}` of the `catch`) — with this. (Keep everything above `let reportText` — the prompt and data gathering — unchanged.)

```ts
  let reportText = ''
  let apiUsed = 'AI'

  try {
    const ai = getAIProvider()
    apiUsed = ai.name
    reportText = await ai.complete(
      [
        { role: 'system', content: 'You are a helpful assistant that outputs only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      { json: true, temperature: 0.7, maxTokens: 2048 }
    )

    if (!reportText) throw new Error(`Empty response from ${apiUsed}`)

    const reportObj = JSON.parse(reportText)

    // Store the report in public.ai_reports table
    const { data: insertedReport, error: insertError } = await supabase
      .from('ai_reports')
      .insert({
        user_id: userId,
        report_type: 'weekly',
        period_start: periodStart,
        period_end: today,
        execution_snapshot: {
          ...reportObj.executionSnapshot,
          weekSummary: reportObj.weekSummary,
        },
        drip_audit: reportObj.dripAudit,
        pattern_insights: JSON.stringify(reportObj.insights),
        recommendations: reportObj.recommendations,
        input_snapshot: {
          sessionsCount: sessionsData.length,
          totalHours,
          habitPct,
          shutdownDays,
          goalsCount: goalsData.length,
          apiUsed,
        },
      })
      .select()
      .single()

    if (insertError) {
      console.error('Failed to store AI report:', insertError)
      return NextResponse.json({ report: reportObj, generatedAt: new Date().toISOString() })
    }

    return NextResponse.json({
      id: insertedReport.id,
      report: reportObj,
      generatedAt: insertedReport.generated_at,
    })
  } catch (err) {
    if (err instanceof AINotConfiguredError) {
      return NextResponse.json({ error: err.message, code: 'AI_NOT_CONFIGURED' }, { status: 503 })
    }
    console.error('AI generation error:', err)
    const message = err instanceof Error ? err.message : 'Failed to generate report'
    return NextResponse.json({ error: message }, { status: 500 })
  }
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` passes (no more `any`, no `GROK_API_KEY`/`GEMINI_API_KEY` direct refs in this file); `npm run build` succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ai-report/route.ts
git commit -m "refactor(ai): route AI Report through provider abstraction with graceful no-key handling"
```

---

## Task 1.6: Key handoff (Claude asks Het)

**This task is interactive.**

- [ ] **Step 1:** Claude asks Het for the **Gemini API key** (free at aistudio.google.com) — or, if Het prefers Groq, the **Groq key** (free at console.groq.com) plus setting `AI_PROVIDER=groq`.
- [ ] **Step 2:** Add to `.env.local` (local) and to Vercel env (Task 0.5):
  ```
  GEMINI_API_KEY=...        # or GROQ_API_KEY=... with AI_PROVIDER=groq
  ```
- [ ] **Step 3:** Restart `npm run dev` so the new env loads.

---

## Task 1.7: End-to-end AI verification

- [ ] **Step 1:** With the key set and dev server running, open the app → AI Reports → generate a report.
- [ ] **Step 2:** Confirm a real report renders and a row appears in `ai_reports` (check via Supabase MCP `execute_sql`: `select id, generated_at, input_snapshot from ai_reports order by generated_at desc limit 1;`).
- [ ] **Step 3:** Confirm the no-key path is graceful: temporarily unset the key, regenerate → UI shows the "AI not configured" message (HTTP 503), no crash. Restore the key.
- [ ] **Step 4: Commit** any fixes:

```bash
git add -A
git commit -m "chore(ai): phase 1 verification fixes"
```

---

## Self-Review

- **Spec coverage:** Phase 0 §4 → Tasks 0.1–0.5 (proxy migration, manifest, SW, icons, deploy). Phase 1 §5 → Tasks 1.1–1.7 (provider abstraction Gemini/Groq, fixed AI Report, graceful no-key, key handoff). ✔
- **Placeholder scan:** all code is complete; the only manual tasks (0.5 deploy, 1.6 key) are inherently interactive and fully specified. ✔
- **Type consistency:** `AIProvider.complete(messages, options)`, `AIMessage`, `AICompletionOptions`, `AINotConfiguredError`, `getAIProvider()`, `isAIConfigured()` used identically across Tasks 1.1–1.5. The route imports `getAIProvider` + `AINotConfiguredError` exactly as exported from `src/lib/ai/index.ts`. ✔
- **Matcher safety:** proxy matcher excludes `api`, `manifest.webmanifest`, `sw.js`, and static assets so PWA install + the future `/api/telegram` webhook (Phase 2) aren't redirected to `/login`. ✔
