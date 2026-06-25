'use strict';
// Themed mini-calendar date-picker popover. Resolves an ISO date, '' (cleared), or null
// (cancelled). Mounted on <body> and self-dismissing on jwh:data-changed so a concurrent
// checklist/calendar rebuild can't orphan it. Focus-trapped; Esc/backdrop cancel; restores focus.
import { monthGrid, addMonths, isoToYM, MONTHS, WEEKDAYS_SHORT } from './lib/minical.js';
import { nowISO } from './lib/dates.js';

export function openDatePicker({ value = '', min = '2026-01-01', max = '2027-12-31' } = {}) {
  return new Promise((resolve) => {
    const today = nowISO();
    const sel = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
    const startYM = isoToYM(sel) || isoToYM(today) || { year: 2026, month: 5 };
    let year = startYM.year, month = startYM.month;
    const prev = document.activeElement;

    const ov = document.createElement('div');
    ov.className = 'dp-overlay';
    ov.innerHTML = `<div class="dp-card" role="dialog" aria-modal="true" aria-label="Choose a date"></div>`;
    document.body.appendChild(ov);
    const card = ov.querySelector('.dp-card');

    let settled = false;
    const focusables = () => [...card.querySelectorAll('button:not([disabled])')];
    const done = (val) => {
      if (settled) return; settled = true;
      ov.remove();
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('jwh:data-changed', onChanged);
      if (prev && prev.focus) prev.focus();
      resolve(val);
    };
    const onChanged = () => done(null);                 // concurrent list rebuild → dismiss
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(null); return; }
      if (e.key !== 'Tab') return;
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    const render = () => {
      const body = monthGrid(year, month).map(w => `<tr>${w.map(c => {
        const dis = c.iso < min || c.iso > max;
        const cls = ['dp-day', c.inMonth ? '' : 'dp-out', c.iso === today ? 'dp-today' : '', c.iso === sel ? 'dp-sel' : ''].filter(Boolean).join(' ');
        return `<td><button type="button" class="${cls}" data-iso="${c.iso}"${dis ? ' disabled' : ''} aria-label="${c.iso}"${c.iso === sel ? ' aria-pressed="true"' : ''}>${c.day}</button></td>`;
      }).join('')}</tr>`).join('');
      card.innerHTML = `
        <div class="dp-nav">
          <button type="button" class="dp-arrow dp-prev" aria-label="Previous month">‹</button>
          <span class="dp-title" role="status" aria-live="polite">${MONTHS[month]} ${year}</span>
          <button type="button" class="dp-arrow dp-next" aria-label="Next month">›</button>
        </div>
        <table class="dp-grid"><thead><tr>${WEEKDAYS_SHORT.map(d => `<th scope="col">${d}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
        <div class="dp-acts">
          <button type="button" class="dp-clear">Clear</button>
          <button type="button" class="dp-set-today">Today</button>
        </div>`;
      card.querySelector('.dp-prev').onclick = () => { ({ year, month } = addMonths(year, month, -1)); render(); };
      card.querySelector('.dp-next').onclick = () => { ({ year, month } = addMonths(year, month, 1)); render(); };
      card.querySelector('.dp-clear').onclick = () => done('');
      card.querySelector('.dp-set-today').onclick = () => { if (today >= min && today <= max) done(today); };
      card.querySelectorAll('.dp-day[data-iso]:not([disabled])').forEach(b => { b.onclick = () => done(b.dataset.iso); });
    };

    render();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('jwh:data-changed', onChanged);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) done(null); });
    setTimeout(() => (card.querySelector('.dp-sel') || card.querySelector('.dp-today') || focusables()[0])?.focus(), 20);
  });
}
