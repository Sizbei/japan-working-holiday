# Packing Long-Press / Right-Click Parity — Design Spec

**Date:** 2026-06-22 · **Status:** draft → review → plan · **Touches:** gestures only

## 1. Goal
Bring the packing rows up to parity with the checklist/explore long-press menus: long-press (touch) or right-click a packing item → a quick-action menu. Per the packing spec §5 long-press note: **custom** rows get ☑/☐ toggle + ✕ Remove; **baked** rows get only ☑/☐.

## 2. Design
- `gestures.js` `resolveTarget(node)` (the existing mapper that already handles `.cal-cell`, the tabetai card, and `.check-item`): add a branch for `node.closest('.pack-item[data-id]')` (packing rows — confirm the actual row class/selector packing.js renders; align this spec to it). Insert it alongside the `.check-item` branch (order doesn't matter — packing rows aren't nested in checklist rows).
- Items: read the row's checkbox + (for custom rows) the remove button; build `{ items: [...] }`:
  - `{ label: cb.checked ? '☐ Mark unpacked' : '☑ Mark packed', run: () => cb.click() }` (always).
  - if the row is a **custom** item (has a `.pack-del`/remove control), add `{ label: '✕ Remove', run: () => removeBtn.click() }`.
- Reuse the existing `openMenu` (now `lib/menu.js`) via the existing long-press wiring + the calendar contextmenu pattern — actually long-press already routes through `resolveTarget`→`openMenu`; **right-click** parity is optional (the checklist rows don't have right-click today, only long-press) → match the checklist: **long-press only** for v1 (right-click deferred, keep scope tight and consistent with checklist).
- Synthesizing a click on the existing controls (the menu actions just `.click()` the real checkbox/remove button) keeps it DRY — no new mutation paths, no new storage logic.

## 3. Files
- **Modify:** `assets/gestures.js` (one `resolveTarget` branch), `assets/sw.js` (CACHE bump — no new asset). Possibly `assets/packing.js` only if the row needs a stable hook class/`data-id` the gesture can target (confirm it already has `data-id` + a checkbox + a remove button; the packing build already renders `data-id` rows, so likely zero packing.js change).

## 4. Hardening / testing
- The menu actions only `.click()` existing, already-tested controls → no new XSS/mutation surface. Labels are static strings.
- The gesture must not fire on a disabled/locked control (packing has none) and must not double-fire (the existing long-press suppress-click handles it).
- Test: existing suites green. Browser (touch-emulation): long-press a baked packing item → menu with only the toggle; toggle works. Long-press a custom item → toggle + ✕ Remove; remove works. Long-press elsewhere (a category header) → no packing menu / falls through. 0 console errors.

## 5. Out of scope
Right-click on packing rows (deferred — checklist parity is long-press only), drag-from-menu, bulk actions.
