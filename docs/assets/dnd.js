'use strict';
// Framework-free drag-and-drop — Pointer Events (mouse + touch) with a keyboard
// fallback (focus a handle, Space to grab, ↑/↓ to move, Space/Enter to drop, Esc to
// cancel). The engine NEVER persists DOM directly: it computes the new id order and
// calls onReorder(ids) — the surface persists to localStorage and its renderer rebuilds.

// pure: move an item by id before/after a target id (exported for tests)
export function reorderIds(ids, dragId, targetId, after = false) {
  if (dragId === targetId) return ids.slice();
  const out = ids.filter(x => x !== dragId);
  if (targetId == null) { out.push(dragId); return out; }
  const i = out.indexOf(targetId);
  if (i < 0) { out.push(dragId); return out; }
  out.splice(after ? i + 1 : i, 0, dragId);
  return out;
}

// shared sr-only live region — every keyboard reorder step is announced (not just the drop)
let liveRegion = null;
function announce(msg) {
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.className = 'sr-only'; liveRegion.setAttribute('aria-live', 'polite'); liveRegion.setAttribute('role', 'status');
    document.body.appendChild(liveRegion);
  }
  liveRegion.textContent = '';            // force re-announce even if text repeats
  setTimeout(() => { if (liveRegion) liveRegion.textContent = msg; }, 30);
}

let liveToast = null;
function toast(msg, undoFn) {
  if (liveToast) liveToast.remove();
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
  const sp = document.createElement('span'); sp.textContent = msg; t.appendChild(sp);   // textContent, not innerHTML — safe for any caller
  if (undoFn) { const b = document.createElement('button'); b.textContent = 'Undo'; b.onclick = () => { undoFn(); t.remove(); }; t.appendChild(b); }
  document.body.appendChild(t);
  liveToast = t;
  setTimeout(() => { if (t.isConnected) { t.classList.add('out'); setTimeout(() => t.remove(), 220); } }, 4200);
}

// Sortable list. opts: { itemSelector, handleSelector, idOf(el)->id, onReorder(ids), label }
export function makeSortable(container, opts) {
  if (!container) return;
  const { itemSelector, handleSelector, idOf, onReorder, label = 'item' } = opts;
  const items = () => [...container.querySelectorAll(itemSelector)];
  const orderIds = () => items().map(idOf);

  // ---- pointer drag ----
  container.querySelectorAll(handleSelector).forEach(handle => {
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      const el = handle.closest(itemSelector);
      if (!el) return;
      e.preventDefault();
      let moved = false;
      const onMove = (ev) => {
        if (!moved) { el.classList.add('dnd-dragging'); moved = true; }
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const overItem = under && under.closest(itemSelector);
        if (overItem && overItem !== el && container.contains(overItem)) {
          const rect = overItem.getBoundingClientRect();
          const after = ev.clientY > rect.top + rect.height / 2;
          container.insertBefore(el, after ? overItem.nextSibling : overItem);
        }
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        el.classList.remove('dnd-dragging');
        if (moved) onReorder(orderIds());
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });

  // ---- keyboard ----
  container.querySelectorAll(handleSelector).forEach(handle => {
    handle.setAttribute('tabindex', '0');
    handle.setAttribute('role', 'button');
    handle.setAttribute('aria-label', `Reorder ${label} — press Space to grab, arrows to move`);
    let originBefore = null;   // the sibling el sat before at grab time — for Escape restore
    handle.addEventListener('keydown', (e) => {
      const el = handle.closest(itemSelector);
      if (!el) return;
      const grabbed = el.classList.contains('dnd-grabbed');
      // next/prev sibling MATCHING itemSelector — skip interleaved non-items (e.g. plan.js .leg rows)
      const matchSib = (up) => { let s = up ? el.previousElementSibling : el.nextElementSibling; while (s && !s.matches(itemSelector)) s = up ? s.previousElementSibling : s.nextElementSibling; return s; };
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (grabbed) { el.classList.remove('dnd-grabbed'); el.removeAttribute('aria-grabbed'); originBefore = null; onReorder(orderIds()); announce(`${label} dropped.`); }
        else { originBefore = el.nextElementSibling; el.classList.add('dnd-grabbed'); el.setAttribute('aria-grabbed', 'true'); announce(`${label} grabbed. Use up and down arrows to move, Space to drop, Escape to cancel.`); }
      } else if (grabbed && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const sib = matchSib(e.key === 'ArrowUp');
        if (sib) {
          if (e.key === 'ArrowUp') container.insertBefore(el, sib);
          else container.insertBefore(sib, el);
          handle.focus();
          const list = items(); announce(`${label} moved to position ${list.indexOf(el) + 1} of ${list.length}.`);
        }
      } else if (grabbed && e.key === 'Escape') {
        e.preventDefault();
        container.insertBefore(el, originBefore);   // restore to the pre-grab position
        originBefore = null;
        el.classList.remove('dnd-grabbed'); el.removeAttribute('aria-grabbed'); handle.focus();
        announce(`${label} move cancelled.`);
      }
    });
  });
}

// Sortable across a GROUP of lists (checklist phases): items reorder within a list AND move
// between lists. A mouse can drag from anywhere on the row — a real drag only starts past a
// 6px threshold so plain clicks (checkbox labels!) still work, and the trailing click is
// swallowed. Touch drags stay on the 44px handle (long-press already owns the quick menu).
// opts: { itemSelector, handleSelector, idOf(el), keyOf(list), label,
//         onChange({id, fromKey, toKey, orders: [{key, ids}]}) } — fires once per completed drop.
export function makeSortableGroup(containers, opts) {
  const lists = (containers || []).filter(Boolean);
  if (!lists.length) return;
  const { itemSelector, handleSelector, idOf, keyOf, onChange, label = 'item' } = opts;
  const itemsIn = (c) => [...c.querySelectorAll(itemSelector)];
  const containerOf = (el) => lists.find(c => c.contains(el));
  const report = (el, fromKey) => onChange({
    id: idOf(el), fromKey, toKey: keyOf(containerOf(el)),
    orders: lists.map(c => ({ key: keyOf(c), ids: itemsIn(c).map(idOf) })),
  });

  // ---- pointer drag (handle: immediate; row: mouse-only, after a click-safe threshold) ----
  const startDrag = (el, e, deferred) => {
    const fromKey = keyOf(containerOf(el));
    let moved = !deferred;
    if (moved) el.classList.add('dnd-dragging');
    const sx = e.clientX, sy = e.clientY;
    const onMove = (ev) => {
      if (!moved) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;   // still just a click
        moved = true; el.classList.add('dnd-dragging'); document.body.classList.add('dnd-noselect');
      }
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      if (!under) return;
      const overItem = under.closest(itemSelector);
      const overList = overItem ? containerOf(overItem) : lists.find(c => c === under || c.contains(under));
      if (overItem && overItem !== el && overList) {
        const rect = overItem.getBoundingClientRect();
        overList.insertBefore(el, ev.clientY > rect.top + rect.height / 2 ? overItem.nextSibling : overItem);
      } else if (!overItem && overList && overList !== containerOf(el)) {
        overList.appendChild(el);   // hovering a list's empty space → drop at its end
      }
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.classList.remove('dnd-noselect');
      el.classList.remove('dnd-dragging');
      if (!moved) return;
      if (deferred) {   // a row-drag ends in a click on the label/row — swallow that one click
        const swallow = (ce) => { ce.preventDefault(); ce.stopPropagation(); };
        document.addEventListener('click', swallow, true);
        setTimeout(() => document.removeEventListener('click', swallow, true), 0);
      }
      report(el, fromKey);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };
  lists.forEach(c => {
    c.classList.add('dnd-group');   // styling hook: row-grab cursor affordance
    c.querySelectorAll(handleSelector).forEach(handle => {
      handle.style.touchAction = 'none';
      handle.addEventListener('pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return;
        const el = handle.closest(itemSelector);
        if (!el) return;
        e.preventDefault(); startDrag(el, e, false);
      });
    });
    c.addEventListener('pointerdown', (e) => {   // whole-row drag — mouse only
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (e.target.closest('button, a, input, select, textarea')) return;   // real controls keep their clicks
      const el = e.target.closest(itemSelector);
      if (el && c.contains(el)) startDrag(el, e, true);
    });
  });

  // ---- keyboard (grab on the handle; arrows hop across group boundaries) ----
  lists.forEach(c => {
    c.querySelectorAll(handleSelector).forEach(handle => {
      handle.setAttribute('tabindex', '0');
      handle.setAttribute('role', 'button');
      handle.setAttribute('aria-label', `Reorder ${label} — press Space to grab, arrows to move, across groups too`);
      let origin = null;   // {list, before} at grab time — for Escape restore + fromKey
      handle.addEventListener('keydown', (e) => {
        const el = handle.closest(itemSelector);
        if (!el) return;
        const grabbed = el.classList.contains('dnd-grabbed');
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (grabbed) {
            el.classList.remove('dnd-grabbed'); el.removeAttribute('aria-grabbed');
            const fromKey = keyOf(origin.list); origin = null;
            report(el, fromKey); announce(`${label} dropped.`);
          } else {
            origin = { list: containerOf(el), before: el.nextElementSibling };
            el.classList.add('dnd-grabbed'); el.setAttribute('aria-grabbed', 'true');
            announce(`${label} grabbed. Arrows move it (into the next group at an edge), Space drops, Escape cancels.`);
          }
        } else if (grabbed && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          const up = e.key === 'ArrowUp';
          const cur = containerOf(el);
          let sib = up ? el.previousElementSibling : el.nextElementSibling;
          while (sib && !sib.matches(itemSelector)) sib = up ? sib.previousElementSibling : sib.nextElementSibling;
          if (sib) { if (up) cur.insertBefore(el, sib); else cur.insertBefore(sib, el); }
          else {
            const next = lists[lists.indexOf(cur) + (up ? -1 : 1)];   // edge of this list → adjacent group
            if (!next) return;
            if (up) next.appendChild(el); else next.insertBefore(el, next.firstElementChild);
          }
          handle.focus();
          const now = containerOf(el), list = itemsIn(now);
          announce(`${label} at position ${list.indexOf(el) + 1} of ${list.length}, group ${lists.indexOf(now) + 1} of ${lists.length}.`);
        } else if (grabbed && e.key === 'Escape') {
          e.preventDefault();
          origin.list.insertBefore(el, origin.before);
          origin = null;
          el.classList.remove('dnd-grabbed'); el.removeAttribute('aria-grabbed'); handle.focus();
          announce(`${label} move cancelled.`);
        }
      });
    });
  });
}

// Movable items onto drop targets (calendar reschedule).
// opts: { itemSelector, canDrag(el)->bool, idOf(el), targetSelector, keyOf(target), onMove(id,key), label }
export function makeMovable(container, opts) {
  if (!container) return;
  const { itemSelector, canDrag, idOf, targetSelector, keyOf, onMove, label = 'event' } = opts;
  container.querySelectorAll(itemSelector).forEach(el => {
    if (canDrag && !canDrag(el)) return;
    el.classList.add('dnd-movable');
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      const id = idOf(el);
      const sx = e.clientX, sy = e.clientY;
      let dropTarget = null, moved = false, lastKey = null;
      const onMv = (ev) => {
        if (!moved) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;   // ignore tap jitter — only a real drag reschedules
          moved = true;
        }
        ev.preventDefault();                 // only now (real drag) — a plain tap still opens the event
        el.classList.add('dnd-dragging');
        container.querySelectorAll(targetSelector).forEach(t => t.classList.remove('dnd-over'));
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        dropTarget = under && under.closest(targetSelector);
        if (dropTarget) { dropTarget.classList.add('dnd-over'); const k = keyOf(dropTarget); if (k !== lastKey) { lastKey = k; announce(`${label} over ${k}`); } }
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMv);
        document.removeEventListener('pointerup', onUp);
        el.classList.remove('dnd-dragging');
        container.querySelectorAll(targetSelector).forEach(t => t.classList.remove('dnd-over'));
        if (moved && dropTarget) { const key = keyOf(dropTarget); if (key) { onMove(id, key); announce(`${label} moved to ${key}.`); } }
        else if (moved) announce(`${label} move cancelled.`);
      };
      document.addEventListener('pointermove', onMv);
      document.addEventListener('pointerup', onUp);
    });
  });
}

export { toast as dndToast };
