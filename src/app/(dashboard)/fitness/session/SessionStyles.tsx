'use client'

// Session-only styles. `fs-` prefix, deliberately not sharing the `ft-` scale:
// this screen is used one-handed, standing at a rack, and needs 56px targets.

export default function SessionStyles() {
  return (
    <style jsx global>{`
      .fs-wrap { max-width: 640px; margin: 0 auto; padding: 0 0 140px; min-height: 100vh; }
      .fs-center { display: flex; align-items: center; justify-content: center; gap: 10px;
        min-height: 60vh; color: var(--text-tertiary); font-size: 0.95rem; }

      .fs-top { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: 12px;
        padding: 12px 14px; background: var(--bg-primary, #0e0e0e);
        border-bottom: 1px solid var(--nav-border, rgba(255,255,255,0.08)); }
      .fs-top-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .fs-top-title { font-size: 1rem; font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em; }
      .fs-top-sub { font-size: 0.74rem; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
      .fs-finish { padding: 10px 18px; border-radius: 10px; border: none; cursor: pointer;
        font-size: 0.85rem; font-weight: 700; background: var(--primary-gradient, var(--accent));
        color: var(--on-accent); min-height: 42px; }
      .fs-finish:disabled { opacity: 0.4; cursor: default; }

      .fs-error { margin: 12px 14px; padding: 11px 14px; border-radius: 10px; font-size: 0.82rem;
        color: #ff6b6b; background: color-mix(in srgb, #ff6b6b 10%, transparent);
        border: 1px solid color-mix(in srgb, #ff6b6b 25%, transparent); }

      .fs-body { display: flex; flex-direction: column; gap: 12px; padding: 14px; }

      /* ── Start screen ── */
      .fs-start { padding: 18px 14px; display: flex; flex-direction: column; gap: 22px; }
      .fs-today { padding: 20px; border-radius: 16px;
        background: color-mix(in srgb, var(--accent) 9%, transparent);
        border: 1px solid color-mix(in srgb, var(--accent) 26%, transparent); }
      .fs-today-lbl { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
        color: var(--accent); }
      .fs-today h2 { font-size: 1.5rem; font-weight: 750; color: var(--text-primary); margin: 6px 0 8px;
        letter-spacing: -0.02em; }
      .fs-today p { font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 16px; }
      .fs-primary { width: 100%; padding: 15px 20px; border-radius: 12px; border: none; cursor: pointer;
        font-size: 0.92rem; font-weight: 700; background: var(--primary-gradient, var(--accent));
        color: var(--on-accent); min-height: 52px; }
      .fs-restday { font-size: 0.87rem; color: var(--text-secondary); line-height: 1.55;
        padding: 14px; border-radius: 11px; background: rgba(255,255,255,0.03); }
      .fs-restday b { color: var(--text-primary); }

      .fs-otherdays { display: flex; flex-direction: column; gap: 8px; }
      .fs-lbl { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
        color: var(--text-tertiary); margin-bottom: 2px; }
      .fs-dayrow { display: flex; align-items: center; justify-content: space-between; gap: 12px;
        width: 100%; padding: 15px 16px; min-height: 54px; border-radius: 12px; cursor: pointer;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.09));
        background: var(--card-bg, rgba(255,255,255,0.025)); color: var(--text-primary); text-align: left; }
      .fs-dayrow--ghost { border-style: dashed; color: var(--text-tertiary); }
      .fs-dayrow-name { font-size: 0.9rem; font-weight: 600; }
      .fs-dayrow-n { font-size: 0.76rem; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }

      /* ── Exercise card ── */
      .fs-ex { border: 1px solid var(--nav-border, rgba(255,255,255,0.08)); border-radius: 15px;
        background: var(--card-bg, rgba(255,255,255,0.025)); overflow: hidden; }
      .fs-ex-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
        padding: 14px 14px 10px; }
      .fs-ex-main { min-width: 0; flex: 1; }
      .fs-ex-name { font-size: 0.97rem; font-weight: 700; color: var(--text-primary);
        display: flex; align-items: center; gap: 7px; letter-spacing: -0.01em; }
      .fs-iso { font-size: 0.56rem; font-weight: 800; letter-spacing: 0.09em; padding: 2px 5px;
        border-radius: 3px; color: #f5a623; border: 1px solid #f5a623; }
      .fs-ex-meta { font-size: 0.74rem; color: var(--text-tertiary); margin-top: 3px; }
      .fs-ex-last { font-size: 0.72rem; color: var(--accent); margin-top: 4px;
        font-variant-numeric: tabular-nums; }
      .fs-ex-actions { display: flex; gap: 4px; flex-shrink: 0; }

      .fs-cues { margin: 0 14px 12px; padding: 12px 14px 12px 30px; border-radius: 10px;
        background: rgba(255,255,255,0.04); font-size: 0.8rem; color: var(--text-secondary);
        line-height: 1.5; display: flex; flex-direction: column; gap: 6px; }

      .fs-sets { padding: 0 10px; }
      .fs-setrow { display: grid; gap: 7px; align-items: center; padding: 5px 4px; }
      .fs-setrow--head { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.08em;
        font-weight: 700; color: var(--text-tertiary); padding-bottom: 2px; text-align: center; }
      .fs-setrow--head span:first-child { text-align: left; padding-left: 4px; }
      .fs-setrow--done .fs-in { border-color: color-mix(in srgb, #34d399 45%, transparent);
        background: color-mix(in srgb, #34d399 8%, transparent); }
      .fs-setrow--done .fs-tick { background: #34d399; color: #06281c; border-color: #34d399; }

      .fs-setno { display: flex; align-items: center; justify-content: center; height: 46px; width: 34px;
        border-radius: 9px; border: 1px solid transparent; background: rgba(255,255,255,0.04);
        color: var(--text-tertiary); font-size: 0.78rem; font-weight: 700; cursor: pointer;
        font-variant-numeric: tabular-nums; }
      .fs-in { width: 100%; height: 46px; text-align: center; border-radius: 9px;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.1));
        background: var(--input-bg, rgba(0,0,0,0.2)); color: var(--text-primary);
        font-size: 1rem; font-weight: 600; outline: none; font-variant-numeric: tabular-nums;
        -moz-appearance: textfield; }
      .fs-in::-webkit-outer-spin-button, .fs-in::-webkit-inner-spin-button {
        -webkit-appearance: none; margin: 0; }
      .fs-in:focus { border-color: var(--accent); }
      .fs-setend { display: flex; align-items: center; gap: 5px; justify-content: flex-end; }
      .fs-tick { display: flex; align-items: center; justify-content: center; width: 46px; height: 46px;
        border-radius: 10px; cursor: pointer; background: rgba(255,255,255,0.04);
        border: 1px solid var(--nav-border, rgba(255,255,255,0.12)); color: var(--text-tertiary); }

      .fs-addset { display: flex; align-items: center; justify-content: center; gap: 7px; width: calc(100% - 20px);
        margin: 8px 10px 12px; padding: 11px; min-height: 44px; border-radius: 10px; cursor: pointer;
        border: 1px dashed var(--nav-border, rgba(255,255,255,0.15)); background: transparent;
        color: var(--text-tertiary); font-size: 0.8rem; font-weight: 600; }
      .fs-add { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
        padding: 16px; min-height: 54px; border-radius: 13px; cursor: pointer;
        border: 1px dashed var(--nav-border, rgba(255,255,255,0.18)); background: transparent;
        color: var(--accent); font-size: 0.88rem; font-weight: 650; }

      /* ── Rest timer ── */
      .fs-rest { position: fixed; left: 12px; right: 12px; bottom: 78px; z-index: 40; max-width: 616px;
        margin: 0 auto; display: flex; align-items: center; gap: 11px; padding: 12px 15px;
        border-radius: 13px; background: var(--bg-elevated, #1a1a1a);
        border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
        box-shadow: 0 10px 34px rgba(0,0,0,0.45); }
      .fs-rest svg { color: var(--accent); flex-shrink: 0; }
      .fs-rest-n { font-size: 1.05rem; font-weight: 750; color: var(--text-primary);
        font-variant-numeric: tabular-nums; min-width: 48px; }
      .fs-rest-bar { flex: 1; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.1); overflow: hidden; }
      .fs-rest-bar div { height: 100%; background: var(--accent); border-radius: 3px; transition: width 1s linear; }
      .fs-rest button { background: none; border: none; cursor: pointer; color: var(--text-tertiary);
        font-size: 0.78rem; font-weight: 650; padding: 6px; }

      /* ── Picker sheet ── */
      .fs-sheet { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column;
        background: var(--bg-primary, #0e0e0e); }
      .fs-sheet-head { display: flex; align-items: center; gap: 10px; padding: 14px;
        border-bottom: 1px solid var(--nav-border, rgba(255,255,255,0.08)); }
      .fs-search { flex: 1; display: flex; align-items: center; gap: 9px; padding: 0 13px; height: 46px;
        border-radius: 11px; border: 1px solid var(--nav-border, rgba(255,255,255,0.1));
        background: var(--input-bg, rgba(0,0,0,0.2)); }
      .fs-search svg { color: var(--text-tertiary); flex-shrink: 0; }
      .fs-search input { flex: 1; background: none; border: none; outline: none;
        color: var(--text-primary); font-size: 0.92rem; min-width: 0; }
      .fs-chips { display: flex; gap: 6px; overflow-x: auto; padding: 12px 14px;
        scrollbar-width: none; }
      .fs-chips::-webkit-scrollbar { display: none; }
      .fs-chips .ft-chip { flex: 0 0 auto; }
      .fs-sheet-list { flex: 1; overflow-y: auto; padding: 0 14px 30px;
        display: flex; flex-direction: column; gap: 6px; }
      .fs-pick { display: flex; align-items: center; justify-content: space-between; gap: 12px;
        width: 100%; padding: 14px 15px; min-height: 56px; border-radius: 12px; cursor: pointer;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.07));
        background: rgba(255,255,255,0.02); color: var(--text-primary); text-align: left; }
      .fs-pick svg { color: var(--accent); flex-shrink: 0; }
      .fs-pick-name { font-size: 0.9rem; font-weight: 650; }
      .fs-pick-meta { font-size: 0.73rem; color: var(--text-tertiary); margin-top: 2px; text-transform: capitalize; }
      .fs-empty { padding: 40px 20px; text-align: center; color: var(--text-tertiary); font-size: 0.88rem; }

      /* ── Done screen ── */
      .fs-done { display: flex; flex-direction: column; align-items: center; gap: 18px;
        padding: 60px 24px; text-align: center; }
      .fs-done-tick { display: flex; align-items: center; justify-content: center; width: 74px; height: 74px;
        border-radius: 50%; background: color-mix(in srgb, #34d399 15%, transparent); color: #34d399;
        border: 2px solid #34d399; }
      .fs-done h1 { font-size: 1.6rem; font-weight: 750; color: var(--text-primary); letter-spacing: -0.02em; }
      .fs-done-stats { display: flex; gap: 26px; flex-wrap: wrap; justify-content: center; }
      .fs-done-stats div { display: flex; flex-direction: column; gap: 3px; }
      .fs-done-stats b { font-size: 1.35rem; font-weight: 750; color: var(--text-primary);
        font-variant-numeric: tabular-nums; }
      .fs-done-stats span { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em;
        color: var(--text-tertiary); font-weight: 650; }
      .fs-prs { display: flex; align-items: center; gap: 9px; padding: 12px 18px; border-radius: 11px;
        font-size: 0.85rem; font-weight: 650; color: #f5a623;
        background: color-mix(in srgb, #f5a623 12%, transparent);
        border: 1px solid color-mix(in srgb, #f5a623 28%, transparent); }
      .fs-done .fs-primary { max-width: 320px; margin-top: 8px; }

      @media (max-width: 400px) {
        .fs-setrow { gap: 5px; }
        .fs-in { font-size: 0.92rem; }
      }
      @media (prefers-reduced-motion: reduce) {
        .fs-rest-bar div { transition: none; }
      }
    `}</style>
  )
}
