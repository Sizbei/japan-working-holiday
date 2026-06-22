# List Controls UX (Search + Add) — Design Spec

**Date:** 2026-06-22 · **Status:** UX exploration → user review (with a served mock) → implement
**Pages:** Checklist (`#/checklist`) and Packing (`#/packing`) — the two single-column list pages (780px). Same treatment on both.

## 1. The problem
Each list page stacks heading → lede → progress → search → add-form → tools before the list. That buries the checkboxes (the user's primary action) and reads heavy. We want **search** and **add** to be present, discoverable, and pleasant — while the list/checkboxes sit **right near the top**. The earlier build moved things up (first checkbox 730→544px) but the controls still feel heavy, and a full-width search bar was too much chrome.

## 2. Principles
- **List-first.** The checkboxes are the content; controls are secondary and must not dominate the top.
- **One obvious Search, one obvious Add.** Both discoverable; neither always-expanded-and-heavy.
- **Lightweight at rest, capable on demand.** Compact by default; expands into a real, usable control when invoked (the "expand into something that works" idea).
- **Consistent** across checklist + packing; **keyboard + touch** friendly; matches the app's editorial-paper / pill aesthetic; honors reduce-motion.
- **Cheap to reach:** Search is also bindable to `/`-scoped-to-page or focus; Add to a key — but the visible affordance is the priority.

## 3. The controls in play
A single **slim toolbar row** under a thinner progress bar holds: Search, Add, and the page's existing toggles (checklist: *All phases / Due soon* chips + *Hide done*; packing: *Collapse all* + *Hide done*). Then the list.

## 4. Variants (mocked — see `docs/mockups/list-controls.html`)

**A — Unified "quick line" (one input does both).**
One slim input: typing **filters live**; a contextual **`＋ Add "<text>"`** action appears (with a tiny phase/category picker) to add exactly what you typed. One affordance, fastest path (type → filter, or type → add). Trade-off: conflates two intents; the add-target picker must be obvious; "what does Enter do" needs a clear rule (Enter = add when nothing matches / when the picker is engaged).

**B — Two compact pills (refined current direction).**
A 🔍 *Search* pill and a `＋ Add` pill in the toolbar; each **expands in place** into its control (search → input; add → a clean inline composer with the input + phase/category select). Explicit, discoverable, lightweight at rest. Trade-off: two affordances; the composer needs a tidy expand.

**C — Minimal icons + popover composer.**
Toolbar is ultra-minimal: progress + small right-aligned 🔍 and ＋ icons. Search expands inline; **＋ opens a small floating composer popover** anchored to the icon. Checkboxes sit highest. Trade-off: icons are less discoverable; popover is more machinery.

## 5. Recommendation
Lead with **B (two compact pills)** for clarity + discoverability, but borrow A's smartest move: when a **search query is active and matches nothing**, surface an inline **`＋ Add "<query>"`** shortcut (so search gracefully becomes add). That gives the explicit affordances *and* the fast unified path, without making the default a single ambiguous box. The composer (Add) expands inline (not a popover) to stay simple and touch-friendly. Final pick is the user's after seeing the mock.

## 6. Interaction details (whichever wins)
- **Search:** expand on click/`/`; live filter (case-insensitive); **force-expand accordions** while filtering; drag disabled while searching; **Esc** clears + collapses + returns focus to the toggle; stays open while a query is present; empty-state `No matches for "<q>"` (esc'd) with the *Add "<q>"* shortcut (per §5).
- **Add:** expand on click; input + phase(checklist)/category(packing) select + Add; **Enter** or Add submits, then collapses; **Esc** cancels + collapses; new item lands in the chosen group and the list scrolls/animates it in.
- **A11y:** real `<button aria-expanded aria-controls>`; focus moves into the revealed control and back to the toggle on collapse; the toolbar is a labeled group.
- **Counts/progress** stay over the full list (search is a view filter, not a data change).

## 7. Out of scope (this UX pass)
Bulk actions, saved searches, fuzzy/typo matching, voice/scan add. Just the search + add affordances and the toolbar layout.

## 8. Process
Build the served mock (`docs/mockups/list-controls.html`) with A/B/C switchable on a realistic list; user reviews + picks (or blends); then implement the chosen variant on `fix/add-row-top` and merge with the width fix + lightweight header.
