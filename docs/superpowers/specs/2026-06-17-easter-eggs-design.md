# Easter Eggs v1 — Design Spec

**Date:** 2026-06-17 · **Status:** Approved (owner picked the set)
**Scope:** 11 small delights across hidden interactions, seasonal/date triggers, and gaming/synth nods. Today the only egg is the Konami code → arcade mode (`konami.js`).

## Architecture
- **`docs/assets/easter.js`** (new) — `mountEaster()`: wires all hidden interactions and runs the date/time checks at boot. Mounted from `main.js`.
- **`docs/assets/lib/audio.js`** (new) — Web Audio synth, NO sound files: `blip('coin'|'1up'|'powerup')` presets + `note(freq,durMs)` for the mini-synth. Lazily creates/`resume()`s a single `AudioContext` on the first user gesture (browsers block autoplay). All audio is a **no-op unless the Sound setting is on**.
- **New Settings toggle "Sound effects" (default OFF)** — `KEYS.sound = 'jwh-sound'`, added to `guide.js` Settings (like Celebrations). Gates every chiptune.
- **Shared effects** — a tiny particle helper (petal drift / burst / katakana rain). May live in `easter.js` or extend `motion.js`. Reuse the confetti style already in `style.css`.

## Guardrails (apply to every egg)
- **Identity-free** (no name/birthday).
- **Automatic** visual eggs (seasonal, 2am) respect the **Celebrations** setting AND `prefers-reduced-motion` (drop movement, keep a subtle static nod). **User-triggered** eggs (taps, magic words, long-press, swipe-konami) always fire.
- **Time = JST (UTC+9)** computed explicitly, so "2am" means Tokyo, not the user's local clock.
- Every dynamic string through `esc()`. New module added to SW `ASSETS` + `CACHE` bump.

## The eggs

### Hidden interactions (user-triggered)
1. **Tap hinomaru ×5** — 5 fast taps on the topbar `.tb-sun` (and/or hero `.hero-mark .sun`) → the sun spins + a sakura/✨ burst + `blip('coin')`.
2. **Long-press brand** — press-hold `.topbar-brand` ~600ms → a small dismissible "secret" card (a wink + "built in vanilla JS, no frameworks, at 2am JST" mini-credits). Focus-trapped, Esc/tap-out closes.
3. **Magic words in search** — listen on existing search inputs (`#search`, `#discSearch`, `#placeSearch`, `#calSearch`): `ramen`→🍜 floats up, `matrix`/`katakana`→a short katakana rain, `tokyo`→the sun pulses, a synth name (`juno`,`moog`,`korg`)→`blip`, `konami`→a hint toast. Debounced; fires once per match.
4. **Swipe-Konami on touch** — detect ↑↑↓↓←→←→ as swipe directions on touch → call `konami.js`'s existing `unlock()` (export it). Phones can't type the code today.

### Seasonal / date (automatic; Celebrations + reduced-motion gated)
5. **Landing day 2026-06-30** — on that date the countdown shows **"DAY 1 · 着いた"**, a torii + confetti fire once, and the hero sub line swaps to an arrival message. (Reuses the countdown render in `dashboard.js`.)
6. **Sakura season** (Mar 20–Apr 10) — gentle cherry petals drift across the page (CSS/canvas particles).
7. **New Year** (Dec 31–Jan 1) — a 明けましておめでとう + torii flourish, a hatsumōde nudge.
8. **2am JST night-owl** (01:00–03:59 JST) — a subtle "still shipping at 2am? 🌙" nod + the CRT warms a touch (a transient class on `<html>`).

### Gaming / synth
9. **Chiptune blips** — `blip()` on the Konami unlock, the arcade toggle, and checklist/map milestones (Sound-gated).
10. **DevTools console art** — at boot, `console.log` a pixel-hinomaru ASCII + a friendly builder message (zero UI cost, always on).
11. **Secret mini-synth** — typing a trigger (`synth`) in a search box opens a small overlay: a row of keys (click + keyboard a–k) play `note()` tones. Resumes audio on open; closes on Esc/tap-out.

## Out of scope
The mini-game (cut by owner); sampled audio; anything needing a network/asset.

## Testing
- `lib/audio.js` is browser-only (AudioContext) — not unit-tested; the note-frequency table can be a pure export if convenient.
- Date/time trigger logic should be a **pure function** (`seasonalEgg(jstDate) → 'landing'|'sakura'|'newyear'|'nightowl'|null`) → unit-tested with injected dates.
- UI eggs via Playwright (tap-burst, long-press card, magic word, swipe-konami, sound toggle gating, the mini-synth overlay).
