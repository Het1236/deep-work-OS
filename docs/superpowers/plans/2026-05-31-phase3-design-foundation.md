# Phase 3 — Visual & UX Redesign: Foundation

> Hybrid theming: dark default + Claude-warm light theme. Foundation first, then page-by-page.
> Verify: `npx tsc --noEmit` + `npm run build`.

**Goal:** Establish the redesign foundation — dual-theme design system (dark default + warm Anthropic light), serif display font, theme toggle (no-FOUC), ⌘K command palette, and mobile-responsive shell — without breaking any existing page.

## Design language
- **Dark (default):** charcoal `#0e0e0e` + mint `#96fac2`, glass cards (existing identity, refined).
- **Light (Claude-warm):** ivory `#F5F1EA` + clay `#CC785C` accent, warm charcoal text, soft shadows, editorial calm.
- **Display font:** Fraunces (serif) for headings via `--font-display`; Manrope body, Geist Mono numerics retained.

## Tasks
1. **Tokens & themes** (`globals.css`): add `--font-display`, `--on-accent`, `--nav-bg`/`--nav-border`; add `[data-theme="light"]` overrides for every surface/accent/text/border/shadow var; theme-aware aurora + `color-scheme`; apply `--font-display` to `.text-display`/`.text-heading`.
2. **Fonts + no-FOUC** (`layout.tsx`): load Fraunces (`--font-display`); inline head script sets `data-theme` from `localStorage('theme')` (default dark) before paint.
3. **ThemeProvider** (`components/ThemeProvider.tsx`): client context, `useTheme()`, toggles `document.documentElement[data-theme]` + persists; mount in `DashboardProviders`.
4. **Command palette** (`components/CommandPalette.tsx`): ⌘K / Ctrl+K, fuzzy nav to all routes + actions (toggle theme, new focus session); mount in `DashboardProviders`; also opens via a `lifeos:command` window event.
5. **Shell theming + wiring** (`Topbar.tsx`, `Sidebar.tsx`): route hardcoded nav backgrounds through `--nav-bg`/`--nav-border`; Topbar search box opens ⌘K and shows the shortcut; Settings icon links to `/settings`; add a theme-toggle button (sun/moon).
6. **Mobile nav**: at ≤860px the sidebar goes off-canvas; a hamburger in the Topbar toggles `documentElement.classList('nav-open')`; overlay + close-on-link-tap. PC layout unchanged.
7. Verify, commit, merge to main, push.

## Follow-on (later turns, page-by-page)
Dashboard → **Projects (add "Inbox" section for project-less tasks; remove "Upcoming")** → Budget → Scoreboard/Evolution → Habits/Journal/Planner/Calendar/Timer → AI Report/Group/Second Brain → auth/onboarding. Each page: responsive + theme-correct + refined components.
