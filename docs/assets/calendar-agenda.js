'use strict';
import { $$, esc } from './lib/dom.js';
import { fmtShort, daysBetween, parseISO } from './lib/dates.js';
import { gcalUrl } from './lib/ics.js';
import { recurOccurrences, isRecurring } from './lib/recur.js';
import { allEvents, visible, isEvergreen, allTasks, catOf, gotoTask, openSidePanel, TODAY, hiddenCats } from './calendar.js';

export function agendaHTML() {
  // merge upcoming events + checklist tasks (with a due date) into one date-sorted stream. A recurring
  // event contributes only its NEXT upcoming occurrence here so a weekly repeat can't flood the list.
  const horizon = (+TODAY.slice(0, 4) + 3) + TODAY.slice(4);
  const evRows = allEvents().filter(e => visible(e) && !isEvergreen(e)).flatMap(e => {
    const occs = recurOccurrences(e, TODAY, horizon).filter(occ => (occ.endDate || occ.date).slice(0, 10) >= TODAY);
    return (isRecurring(e) ? occs.slice(0, 1) : occs).map(occ => ({ date: occ.date, ev: e }));
  });
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
  // group by DAY: one header per date (weekday + date + a relative "Today / Tomorrow / in N days"
  // cue), so same-day events sit together and the temporal distance is legible at a glance. The
  // per-row date pill is replaced by a small category-colour dot (the day header carries the date).
  let lastDay = '';
  return `<div class="agenda">${upcoming.map(x => {
    const day = x.date.slice(0, 10);
    const head = day !== lastDay ? (lastDay = day, dayHeadHTML(day)) : '';
    if (x.tk) {
      const t = x.tk;
      return head + `<div class="agenda-row agenda-task" data-task="${esc(t.taskId)}">
        <span class="agenda-dot cat-task" aria-hidden="true"></span>
        <span class="agenda-body"><button type="button" class="agenda-title" data-task="${esc(t.taskId)}">☑ ${esc(t.title)}</button>
          <span class="agenda-area">checklist task</span></span></div>`;
    }
    const e = x.ev;
    return head + `<div class="agenda-row" data-ev="${esc(e.id)}">
      <span class="agenda-dot cat-${esc(catOf(e))}" aria-hidden="true"></span>
      <span class="agenda-body"><button type="button" class="agenda-title" data-ev="${esc(e.id)}">${esc(e.title)}${isRecurring(e) ? ' <span class="agenda-recur" title="repeats ' + esc(e.recur) + '" aria-label="repeats ' + esc(e.recur) + '">↻</span>' : ''}</button>
        ${e.area ? `<span class="agenda-area">${esc(e.area)}</span>` : ''}
        ${e.bookBy ? bookByHTML(e.bookBy) : ''}</span>
      <a class="agenda-gcal" href="${esc(gcalUrl(e))}" target="_blank" rel="noopener noreferrer" title="Add to Google Calendar" data-stop>+G</a></div>`;
  }).join('')}</div>`;
}

// a booking deadline reads by urgency: OVERDUE (passed — book now) in red, due-soon (≤7d) emphasised,
// otherwise a quiet reminder. A trip planner's whole point is not missing these.
function bookByHTML(iso) {
  const d = daysBetween(TODAY, iso);
  const overdue = d !== null && d < 0;
  const soon = d !== null && d >= 0 && d <= 7;
  const cls = overdue ? ' overdue' : soon ? ' soon' : '';
  const txt = overdue ? `book-by ${fmtShort(iso)} passed — book ASAP` : `book by ${fmtShort(iso)}`;
  return `<span class="agenda-book${cls}">${overdue ? '⚠ ' : ''}${esc(txt)}</span>`;
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function relLabel(iso) {
  const d = daysBetween(TODAY, iso);
  if (d === null) return '';
  if (d < 0) return 'Now';                 // an ongoing multi-day stay that started before today
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d <= 30) return `in ${d} days`;
  return '';
}
function dayHeadHTML(iso) {
  const dt = parseISO(iso);
  const wd = dt ? WD[dt.getUTCDay()] : '';
  const rel = relLabel(iso);
  const isToday = daysBetween(TODAY, iso) === 0;
  return `<div class="agenda-day${isToday ? ' is-today' : ''}">
    <span class="agenda-day-date">${wd ? esc(wd) + ' · ' : ''}${esc(fmtShort(iso))}</span>
    ${rel ? `<span class="agenda-day-rel">${esc(rel)}</span>` : ''}</div>`;
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
