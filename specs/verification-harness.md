# Headless verification harness (CDP) — the loop's test rig

The design loop mandates headless verification; this file is the executable recipe (it lived only
in session memory before — a compaction-stranding risk, now fixed).

## Boot

```bash
pkill -f "http.server 8282"; pkill -f "remote-debugging-port=9284"; sleep 1
cd docs && (python3 -m http.server 8282 >/dev/null 2>&1 &) ; sleep 2       # serve from docs/
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --remote-debugging-port=9284 --user-data-dir="$(mktemp -d)" --no-first-run \
  --window-size=1300,1000 about:blank &
```

Drive it from Node ≥22 (built-in WebSocket) via `http://127.0.0.1:9284/json/version` →
`webSocketDebuggerUrl`. Per target: `Target.createTarget` → `Target.attachToTarget {flatten:true}`
→ enable `Page`/`Runtime` → **`Network.setBypassServiceWorker {bypass:true}`** →
`Emulation.setDeviceMetricsOverride` → `Page.addScriptToEvaluateOnNewDocument` seeding
`localStorage['jwh-auth-v1']='ok'` (+ `jwh-theme`, `jwh-compact-v1` as needed) → navigate with a
UNIQUE cache-bust query `index.html?v=<n><letter>#/route`. Track `Runtime.exceptionThrown` — the
pass bar is 0.

## Hard-won gotchas (each cost a debugging session — believe them)

- **Synthetic clicks lie.** `el.dispatchEvent(new MouseEvent('click'))` skips the pointer
  pipeline. The month grid's drag-create calls `setPointerCapture`, which retargets the real
  click at the GRID — per-cell click listeners never fire for real mice even though synthetic
  clicks pass. Behavior changes MUST be verified with trusted input:
  `Input.dispatchMouseEvent` mousePressed/mouseReleased (add `buttons:1` on mouseMoved for drags).
- **Check what's under the press point** (`document.elementFromPoint`) before blaming the code —
  a "cell body" click at 70% height may land on a chip or the "+N more" button.
- **Background tabs throttle rAF.** Creating a second target backgrounds the first; smooth
  scrolling + rAF-throttled handlers stall → stale labels. `Target.activateTarget` before probing
  a tab, or use fresh sequential tabs.
- **`html{scroll-behavior:smooth}` animates focus scrolling.** A bare `.focus()` can start a
  window scroll; anything that dismisses-on-scroll will self-destruct. Use
  `focus({preventScroll:true})` in fixes, and `await` settle time in probes.
- **`Page.captureScreenshot` clip is in PAGE coordinates** — add `window.scrollY` to
  `getBoundingClientRect().top` or you'll clip beige nothing.
- **Web fonts reflow the endless grid.** Wait ~4s after boot (or `document.fonts.ready`) before
  measuring geometry.
- **Emulation.setEmulatedMedia hover:none does NOT work in this harness** — verify touch CSS by
  cascade inspection, not emulation.
- **Calendar mini-matrix** (run whenever calendar files are touched): boot lands on today with
  correct label · ‹ › moves label · Today returns · leave→return restores viewed month · compact
  boot intact · quick-add lands on its date. All with 0 exceptions.

## Contrast measurement (WCAG AA — "measure, don't eyeball")

Tinted chips composite over the cell bg, so computed `background-color` alone is not the rendered
color. Procedure: screenshot the region, sample the actual PIXELS of text and background
(decode PNG or `captureScreenshot {clip}` of a few px), then compute the WCAG ratio:
`L = 0.2126R' + 0.7152G' + 0.0722B'` with `c' = (c/255 ≤ .03928) ? c/255/12.92 :
((c/255+.055)/1.055)^2.4`; ratio `(L1+.05)/(L2+.05)` ≥ 4.5 body / 3.0 large text. Put the
numbers in the commit body. (For flat un-composited pairs, resolving the two computed colors
through the same formula is acceptable.)

## Reachable surfaces (the FULL denominator — 14, not "13 routes")

`ROUTES` (11): dashboard, calendar, plan, map, explore, going, people, checklist, budget, rooms,
emergency. `HIDDEN` deep-linked (3): deadlines (notifications bell target), packing (dashboard
teaser), phrases. Full sweeps iterate all 14.
- **Touch personas need touch-context checks.** #136 shipped dblclick-rename + title= tooltips +
  hover hostnames to a phone-primary owner — three failures with ONE root cause (hover-only
  affordances), invisible to a desktop-mouse CDP pass. When the owner is touch-first, drive the
  flow with Input.dispatchTouchEvent and ask "how would a finger DISCOVER this?" per affordance.
- **esc() is an HTML escaper, not a CSS one.** HTML entities decode BEFORE the CSS parser runs —
  esc()'d values inside style="url('…')" can still escape the url() context. Never string-build
  URLs into style attributes: validate the charset strictly and assign via the CSSOM.
