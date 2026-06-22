# Add Your Own Checklist Items (+ from an Event) — Design Spec

**Date:** 2026-06-22 · **Status:** draft → review → plan · **Touches:** checklist + calendar event menu

## 1. Goal
The yearlong checklist is baked-only today. Let the user **add their own checklist items easily** — type a task, pick which phase to drop it in, done — and check/remove them like any item. Plus: **add a checklist item straight from an event** (a calendar event's menu gains "＋ Add to checklist", creating an item from the event title + date). Mirrors the proven packing custom-item pattern.

## 2. Data model
- New store `KEYS.checklistCustom: 'jwh-checklist-custom-v1'` = `[{ id:'cku<ts>', task, phase, dueBy? }]`. `phase` = a baked phase label **or** the literal `"My tasks"`. No `requires` (custom items never lock).
- Check-state reuses the existing `jwh-checklist-v1` map (keyed by id — custom ids flow in). Due dates reuse `jwh-due-v1` (the 📅 picker already works on any item id). Reorder reuses `jwh-checkorder-v1`.

## 3. Logic (`content.js`, + a small pure helper)
- **`checklistItems(data)`** (the progress/source list) — append custom items so progress + known-ids include them: after the baked loop, push `loadChecklistCustom()` items (with their `phase`, `effectiveDue = due[id]||dueBy||''`). This makes the progress bar, the "due soon" view, and `knownIds` (lock logic) all account for custom items automatically.
- **`renderChecklist`** — for each baked phase `p`, the rendered list = `orderItems([...p.items, ...customFor(p.phase)], order[pi])` (custom items marked `_custom:true`). After the baked phases, render a synthetic **"My tasks"** accordion group (collapse id `chk-phase-mine`) containing custom items whose `phase` is `"My tasks"` (or whose `phase` matches no baked phase — orphan-safe). Show the group only if it has items.
- **Pure helper `lib/checklist.js`** (unit-tested): `customItem(task, phase, dueBy='')` → `{id, task, phase, dueBy}` builder (id `'cku'+Date.now()` passed in for determinism in tests: `customItem(task, phase, dueBy, id)`); and `partitionCustom(custom, bakedPhaseLabels)` → `{ byPhase: Map<label, item[]>, mine: item[] }` (orphans → mine). No mutation.

## 4. UI
- **Add-item form** on the checklist page (near the view toggles / progress), like packing's add row: a text `<input>` + a phase `<select>` (options = the baked phase labels + "My tasks") + an `Add` button. On submit: `saveChecklistCustom([...loadChecklistCustom(), customItem(task, phase, '', 'cku'+Date.now())])`, then re-render (and dispatch `jwh:data-changed` so the dashboard checklist teaser/progress update — the checklist already dispatches on check). Empty task → ignored.
- **Custom rows** render via the existing `checkItemHTML` (custom items get a remove control): add a `.check-del` button on `_custom` rows (`data-del="${esc(id)}"`, aria-label `Remove ${esc(task)}`), mirroring packing's `.pack-del`. Baked rows unchanged (no remove).
- **Remove a custom item:** drop its id from `jwh-checklist-custom-v1` **and** the `jwh-checklist-v1` checked map **and** (lazily) the order store, then re-render — exactly packing's 3-store cleanup.
- The existing check/flag/📅-due/drag/hide-done/accordion/celebrate all work on custom items unchanged (custom items count toward 100%).

## 5. Add-from-event (calendar)
- `lib/calevents.js eventMenuSpec` — add `{ key:'checklist', label:'＋ Add to checklist' }` to BOTH the baked and user event menus (after `plan`).
- `calendar.js eventMenuItems` `RUN` map — add `checklist: () => addEventToChecklist(ev)`. `addEventToChecklist(ev)` (in calendar.js or imported): `saveChecklistCustom([...loadChecklistCustom(), customItem(ev.title, 'My tasks', ev.date.slice(0,10), 'cku'+Date.now())])` + dispatch `jwh:data-changed` + a `dndToast('Added to checklist')`. (calendar.js reads/writes the checklist-custom store via `lib/store.js` KEYS — small shared accessors, or import the load/save from content.js if exported; prefer a tiny `lib/checklist.js` store wrapper to avoid a calendar→content import.)
- This ties "if I like an event" → one click puts it on the checklist with its date as the due hint.

## 6. Files
- **Create:** `assets/lib/checklist.js` (pure `customItem`/`partitionCustom` + the `load/saveChecklistCustom` store wrappers), `tests/checklist.test.mjs`.
- **Modify:** `assets/content.js` (extend `checklistItems`, merge custom in `renderChecklist`, add-form wiring, `.check-del` handler), `index.html` (the add-item form on the checklist view), `assets/lib/store.js` (`checklistCustom` KEY), `assets/lib/calevents.js` (the `checklist` menu key), `assets/calendar.js` (`addEventToChecklist` + RUN entry), `assets/style.css` (the add row + `.check-del`, if not covered), `assets/sw.js` (precache `assets/lib/checklist.js` + CACHE bump).
- **Reuse:** the packing custom-item pattern, `checkItemHTML`, the accordion, `dndToast`.

## 7. Hardening / testing
- **XSS:** the custom `task` is user free-text → it flows through `checkItemHTML` which must `esc()` it (confirm the existing baked path already `esc()`s the task; custom uses the same path). `data-del`/aria-label `esc()`'d, double-quoted attributes. ids are `cku<ts>` (never from task text).
- **3-store removal** (custom + checked + order); orphan-safe order (lazy skip).
- **Progress counts custom** (via `checklistItems`) even with hide-done; the "My tasks" group's `.acc-count` over full items.
- **No lock breakage:** custom items have no `requires`, and adding custom ids to `knownIds` keeps baked items' `requires` resolution intact (a baked item requiring a baked id is unaffected).
- **Single-dispatch:** the add/remove/event-add paths `saveChecklistCustom(...)` then dispatch `jwh:data-changed` once (the checklist + dashboard listen) — no double-render at the mutation site.
- `tests/checklist.test.mjs`: `customItem` (fields, id passed-in, no mutation), `partitionCustom` (byPhase grouping, orphans→mine, empty). Existing suites green. Browser: add an item to a chosen phase → appears + counts; add "My tasks" → the group appears; check it → progress moves; remove → gone + checked/order cleaned; right-click an event → "＋ Add to checklist" → it lands in My tasks with the event date; reload persists; 0 console errors.

## 8. Out of scope
Custom phases (beyond "My tasks"), per-item `requires` on custom items, editing a custom item's text in place (remove + re-add), syncing event edits to the linked checklist item.
