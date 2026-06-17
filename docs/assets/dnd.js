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

let liveToast = null;
function toast(msg, undoFn) {
  if (liveToast) liveToast.remove();
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
  t.innerHTML = `<span>${msg}</span>`;
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
    handle.addEventListener('keydown', (e) => {
      const el = handle.closest(itemSelector);
      if (!el) return;
      const grabbed = el.classList.contains('dnd-grabbed');
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (grabbed) { el.classList.remove('dnd-grabbed'); el.removeAttribute('aria-grabbed'); onReorder(orderIds()); toast(`Moved ${label}.`); }
        else { el.classList.add('dnd-grabbed'); el.setAttribute('aria-grabbed', 'true'); }
      } else if (grabbed && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const sib = e.key === 'ArrowUp' ? el.previousElementSibling : el.nextElementSibling;
        if (sib && sib.matches(itemSelector)) {
          if (e.key === 'ArrowUp') container.insertBefore(el, sib);
          else container.insertBefore(sib, el);
          handle.focus();
        }
      } else if (grabbed && e.key === 'Escape') {
        el.classList.remove('dnd-grabbed'); el.removeAttribute('aria-grabbed');
      }
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
      let dropTarget = null, moved = false;
      const onMv = (ev) => {
        ev.preventDefault();                 // only now (real drag) — a plain tap still opens the event
        moved = true; el.classList.add('dnd-dragging');
        container.querySelectorAll(targetSelector).forEach(t => t.classList.remove('dnd-over'));
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        dropTarget = under && under.closest(targetSelector);
        if (dropTarget) dropTarget.classList.add('dnd-over');
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMv);
        document.removeEventListener('pointerup', onUp);
        el.classList.remove('dnd-dragging');
        container.querySelectorAll(targetSelector).forEach(t => t.classList.remove('dnd-over'));
        if (moved && dropTarget) { const key = keyOf(dropTarget); if (key) onMove(id, key); }
      };
      document.addEventListener('pointermove', onMv);
      document.addEventListener('pointerup', onUp);
    });
  });
}

export { toast as dndToast };
