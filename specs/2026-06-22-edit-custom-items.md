# Edit Custom Items In Place — Design Spec

**Date:** 2026-06-22 · **Status:** draft → review → plan · **Touches:** checklist + packing custom rows

## 1. Goal
You can add a custom checklist task / packing item but can't fix a typo without remove-and-re-add. Add **in-place editing** of a custom item's text. Baked items stay read-only.

## 2. Design
- Custom rows (`_custom:true`) already render a `.check-del`/`.pack-del` ✕ remove button. Add a small **✎ edit button** beside it (only on custom rows).
- Clicking ✎ swaps the item's text (`.ci-task` / `.pack-name`) for a focused inline `<input>` pre-filled with the current text (via `.value`, safe). **Enter** or blur **saves**; **Esc** cancels (no change). Saving with an empty/whitespace value is ignored (keeps the old text). On save: update the matching entry in the custom store and re-render.
- Both pages, consistent. Touch-friendly (a real `<button aria-label="Edit …">`), keyboard accessible (focus moves to the input on edit, back to the row on save/cancel).

## 3. Logic (pure helper + store)
- `lib/checklist.js`: `renameCustom(arr, id, text)` → a new array with the matching item's `task` set to `text.trim()` (no-op if id missing or text blank); no mutation. Packing reuses the same shape — add `renamePackCustom(arr, id, text)` setting `item`, OR a generic `renameById(arr, id, field, text)` shared. Prefer one small generic pure helper used by both. Unit-tested.
- `content.js` / `packing.js` wire the ✎ button → read the new value → `saveChecklistCustom(renameCustom(loadChecklistCustom(), id, val))` (and packing equiv) → dispatch `jwh:data-changed` (checklist) / re-render (packing), matching their existing add/remove handlers' single-render pattern.

## 4. Files
- **Modify:** `assets/lib/checklist.js` (the rename helper), `tests/checklist.test.mjs` (rename cases), `assets/content.js` (✎ on custom rows + edit handler), `assets/packing.js` (✎ + edit handler), `assets/style.css` (✎ button + inline-edit input), `assets/sw.js` (CACHE bump — no new file).
- **Reuse:** the existing custom-row render + the `commit`/save paths.

## 5. Hardening / testing
- XSS: the edited text is set via `<input>.value` (DOM property, safe) and re-rendered via the existing `esc(it.task)`/`esc(it.item)` row render — confirm no raw innerHTML of the new value. ✎ button `data-*` use `esc(id)`, AND its **`aria-label` must `esc()` the text** — `aria-label="Edit ${esc(it.task)}"` / `Edit ${esc(it.item)}` (match the existing remove button's `aria-label="Remove ${esc(...)}"`; a `"` in the text would otherwise break the attribute).
- **Edit lifecycle (avoid the re-render race):** only ONE row in edit mode at a time (opening a new editor, or any re-render, closes the prior one). On save: read the input value, then re-render (which destroys the inline input) — i.e. **save → close → re-render**, matching the existing add/remove handlers. A `jwh:data-changed` arriving mid-edit (rare — e.g. another tab) re-renders and discards the in-progress edit; acceptable. Focus: opening edit moves focus to the input; save/cancel returns focus to the row (use the existing `captureCheckFocus` selector pattern, or focus the row's first control after re-render).
- Edge: empty/whitespace save ignored; editing while a search filter is active (the row re-renders filtered — saving still updates the store; the row stays visible if it still matches, else filters out — acceptable); only ONE row in edit mode at a time (opening edit on another row, or re-render, closes the first).
- Single-render: the save dispatches/re-renders once (no double).
- `tests/checklist.test.mjs`: `renameCustom`/`renameById` (updates the right item, blank → no-op, missing id → unchanged, no mutation).
- Browser: add a custom item, click ✎, change the text, Enter → updated text persists (in `jwh-checklist-custom-v1` / `jwh-pack-custom-v1`); Esc cancels; blank save ignored; baked items have no ✎; 0 console errors.

## 6. Out of scope
Editing a custom item's phase/category (remove + re-add), editing baked items, editing the due date here (the 📅 picker already does that), multi-row simultaneous edit.
