'use strict';
import { $$, esc } from './lib/dom.js';
import { MONTHS, fmtShort } from './lib/dates.js';
import { gcalUrl } from './lib/ics.js';
import { allEvents, visible, allTasks, catOf, gotoTask, openSidePanel, TODAY, hiddenCats } from './calendar.js';

export function agendaHTML() {
  // merge upcoming events + checklist tasks (with a due date) into one date-sorted stream
  const evRows = allEvents().filter(e => visible(e) && (e.endDate || e.date).slice(0, 10) >= TODAY).map(e => ({ date: e.date, ev: e }));
  const tkRows = allTasks().filter(t => t.date.slice(0, 10) >= TODAY).map(t => ({ date: t.date, tk: t }));
  const upcoming = [...evRows, ...tkRows].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 60);
  if (!upcoming.length) {
    const hidden = hiddenCats.size > 0;
    return `<div class="empty empty-state">
      <div class="empty-emoji" aria-hidden="true">📭</div>
      <p class="empty-h">No upcoming events${hidden ? ' in the shown categories' : ''}.</p>
      ${hidden ? '<p class="empty-sub">Some categories are filtered out — tap a greyed legend chip above to show them.</p>' : ''}
    </div>`;
  }
  let last = '';
  return `<div class="agenda">${upcoming.map(x => {
    const mk = x.date.slice(0, 7);
    const head = mk !== last ? (last = mk, `<div class="agenda-month">${MONTHS[+x.date.slice(5, 7) - 1]} ${x.date.slice(0, 4)}</div>`) : '';
    if (x.tk) {
      const t = x.tk;
      return head + `<div class="agenda-row agenda-task" data-task="${esc(t.taskId)}">
        <span class="agenda-date cat-task">${esc(fmtShort(t.date))}</span>
        <span class="agenda-body"><button type="button" class="agenda-title" data-task="${esc(t.taskId)}">☑ ${esc(t.title)}</button>
          <span class="agenda-area">checklist task</span></span></div>`;
    }
    const e = x.ev;
    return head + `<div class="agenda-row" data-ev="${esc(e.id)}">
      <span class="agenda-date cat-${esc(catOf(e))}">${esc(fmtShort(e.date))}</span>
      <span class="agenda-body"><button type="button" class="agenda-title" data-ev="${esc(e.id)}">${esc(e.title)}</button>
        ${e.area ? `<span class="agenda-area">${esc(e.area)}</span>` : ''}
        ${e.bookBy ? `<span class="agenda-book">book by ${esc(fmtShort(e.bookBy))}</span>` : ''}</span>
      <a class="agenda-gcal" href="${esc(gcalUrl(e))}" target="_blank" rel="noopener noreferrer" title="Add to Google Calendar" data-stop>+G</a></div>`;
  }).join('')}</div>`;
}
export function wireAgenda() {
  // the .agenda-title button is the keyboard trigger (native Enter/Space); its click bubbles to the
  // row. A mouse click anywhere on the row (except the +G link) also opens the detail.
  $$('#calView .agenda-row').forEach(r => {
    r.addEventListener('click', (e) => {
      if (e.target.closest('[data-stop]')) return;
      if (r.dataset.task) { gotoTask(r.dataset.task); return; }
      const ev = allEvents().find(x => x.id === r.dataset.ev); if (ev) openSidePanel(ev, e.target.closest('button') || r);
    });
  });
}
