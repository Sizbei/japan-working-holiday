'use strict';
import { $, $$, esc } from './lib/dom.js';
import { daysBetween, fmtShort } from './lib/dates.js';
import { isMultiDay, fmt12 } from './lib/weekgrid.js';
import { monthGrid } from './lib/minical.js';
import { makeMovable } from './dnd.js';
import { viewY, viewM, TODAY, allEvents, visible, catOf, safeCat, tasksOn, taskChipHTML, allTasks, isEvergreen, openModal, openSidePanel, dayPopover, gotoTask, rescheduleEvent, goAgenda } from './calendar.js';

function pad(n) { return String(n).padStart(2, '0'); }

const MONTH_SINGLES = 3;      // chips shown per cell before "+N more"

// ENDLESS month: one continuous week-grid spanning the whole data range (the trip year —
// ~60 weeks, cheap enough to render whole; no virtual windowing). Month-separator rows sit above
// the week containing each 1st; the coordinator watches scroll and updates the label / mini-nav /
// cockpit to the month at the top of the viewport. Multi-day events keep per-month anchoring: one
// chip at the first covered day of EACH month they span ("‹" when continuing). Evergreen spans stay
// in the Ongoing strip.
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const addDaysISO = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// full range: month before the earliest event → month after the latest (today always included)
function dataRange() {
  let lo = TODAY.slice(0, 7), hi = TODAY.slice(0, 7);
  for (const e of allEvents()) {
    const s = String(e.date || '').slice(0, 7), en = String(e.endDate || e.date || '').slice(0, 7);
    if (s && s < lo) lo = s;
    if (en && en > hi) hi = en;
  }
  const step = (ym, n) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  return { lo: step(lo, -1), hi: step(hi, 1) };
}

export function monthHTML() {
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const { lo, hi } = dataRange();
  const rangeStart = (() => { const first = lo + '-01'; const dow = new Date(first + 'T00:00:00Z').getUTCDay(); return addDaysISO(first, -dow); })();
  const lastDay = (() => { const d = new Date(Date.UTC(+hi.slice(0, 4), +hi.slice(5, 7), 0)); return d.toISOString().slice(0, 10); })();
  const rangeEnd = (() => { const dow = new Date(lastDay + 'T00:00:00Z').getUTCDay(); return addDaysISO(lastDay, 6 - dow); })();

  const evs = allEvents().filter(visible);
  const ongoing = evs.filter(isEvergreen);
  const strip = ongoing.length ? `<div class="cal-ongoing"><div class="cal-ong-lab">☀ Ongoing this season <span>— open all month, tap for details</span></div><div class="cal-ong-pills">`
    + ongoing.map(e => `<button class="cal-opill cat-${esc(catOf(e))}" data-ev="${esc(e.id)}" title="${esc(e.title)}"><span class="cal-ong-dot" aria-hidden="true"></span>${esc(e.title)}</button>`).join('')
    + `</div></div>` : '';

  // multi-day (non-evergreen): one anchored chip at the first covered day of EACH month spanned
  const anchored = new Map();   // iso → [{ ev, cont, end }]
  const singlesByDay = new Map();
  for (const e of evs) {
    if (isEvergreen(e)) continue;
    const s = e.date.slice(0, 10), en = (e.endDate || e.date).slice(0, 10);
    if (!isMultiDay(e)) {
      if (!singlesByDay.has(s)) singlesByDay.set(s, []);
      singlesByDay.get(s).push(e);
      continue;
    }
    let ym = s.slice(0, 7) < lo ? lo : s.slice(0, 7);
    while (ym <= en.slice(0, 7) && ym <= hi) {
      const anchor = s > ym + '-01' ? s : ym + '-01';
      if (anchor <= en) {
        if (!anchored.has(anchor)) anchored.set(anchor, []);
        anchored.get(anchor).push({ ev: e, cont: s < anchor, end: en });
      }
      const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 1)); ym = d.toISOString().slice(0, 7);
    }
  }
  for (const list of singlesByDay.values()) list.sort((a, b) => (a.time || '~').localeCompare(b.time || '~'));

  let cells = '', day = rangeStart, i = 0;
  while (day <= rangeEnd) {
    // a full-width month separator above the week containing each 1st (incl. the very first week)
    if (i % 7 === 0) {
      const weekEnd = addDaysISO(day, 6);
      const firstOfMonth = day.slice(8, 10) === '01' ? day : (weekEnd.slice(8, 10) < day.slice(8, 10) ? weekEnd.slice(0, 8) + '01' : null);
      const sepYm = i === 0 ? lo : (firstOfMonth ? firstOfMonth.slice(0, 7) : null);   // week-0 pad days belong to lo's PRIOR month — label the range month
      if (sepYm) cells += `<div class="cal-msep" data-ym="${esc(sepYm)}" role="heading" aria-level="3">${esc(MONTHS_LONG[+sepYm.slice(5, 7) - 1])} ${esc(sepYm.slice(0, 4))}</div>`;
    }
    const date = day, weekend = (i % 7 === 0 || i % 7 === 6), isToday = date === TODAY;
    const past = date < TODAY;
    const singles = singlesByDay.get(date) || [];
    const multis = anchored.get(date) || [];
    const tks = tasksOn(date);
    const hasBook = singles.some(e => e.bookBy);
    const items = [...singles.map(e => ({ ev: e })), ...multis, ...tks.map(t => ({ tk: t }))];
    const chips = items.slice(0, MONTH_SINGLES).map(x => {
      if (x.tk) return taskChipHTML(x.tk);
      const e = x.ev;
      const range = x.end ? `<span class="cc-range">${x.cont ? '‹ ' : ''}→ ${esc(fmtShort(x.end))}</span>` : '';
      const tm = x.end ? '' : fmt12(e.time);
      const time = tm ? `<span class="cc-time">${esc(tm)}</span>` : '';
      return `<button class="cal-chip cat-${esc(catOf(e))}${tm ? ' timed' : ''}" data-ev="${esc(e.id)}" title="${esc(e.title)}">${time}<span class="cc-t">${esc(e.title)}</span>${range}</button>`;
    }).join('');
    const moreN = items.length - Math.min(items.length, MONTH_SINGLES);
    const more = moreN > 0 ? `<button type="button" class="cal-more" data-day="${esc(date)}">+${moreN} more</button>` : '';
    const bk = hasBook ? `<span class="bk-dot" title="has a booking deadline"></span>` : '';
    const nEv = singles.length + multis.length;
    const aria = `${esc(date)}, ${nEv} event${nEv === 1 ? '' : 's'}${tks.length ? `, ${tks.length} task${tks.length === 1 ? '' : 's'}` : ''}`;
    const dayN = date.slice(8, 10).replace(/^0/, '');
    const label = date.slice(8, 10) === '01' ? `${esc(MONTHS_LONG[+date.slice(5, 7) - 1].slice(0, 3))} ${dayN}` : dayN;
    const cls = ['cal-cell', isToday && 'today', past && 'past', weekend && 'weekend'].filter(Boolean).join(' ');
    cells += `<div class="${cls}" data-day="${esc(date)}">
      <span class="cal-row"><button type="button" class="cal-date" data-day="${esc(date)}" aria-label="${aria}">${label}</button>${bk}</span>
      ${chips}${more}</div>`;
    day = addDaysISO(day, 1); i++;
  }
  return `${strip}<div class="cal-dowrow">${dows.map(x => `<div class="cal-dow">${esc(x)}</div>`).join('')}</div><div class="cal-grid cal-endless">${cells}</div>`;
}

// ---- endless-scroll reactions ----
export function scrollToMonth(ym, smooth) {
  const sep = $(`#calView .cal-msep[data-ym="${ym}"]`);
  sep?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
}
export function scrollToDay(iso, smooth) {
  const cell = $(`#calView .cal-cell[data-day="${iso}"]`);
  cell?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
}
// watch scrolling; report the month whose separator is closest above the viewport top → the
// coordinator updates label / mini-nav / cockpit ("the rest of the page reacts").
export function wireEndless(onMonth) {
  const grid = $('#calView .cal-grid'); if (!grid) return;
  let raf = 0, lastYm = '';
  const topline = () => {
    const seps = $$('#calView .cal-msep');
    if (!seps.length) return '';
    let cur = seps[0].dataset.ym;
    const th = Math.max(160, window.innerHeight * 0.35);   // proportional: a centered 'today' must attribute to ITS month
    for (const s of seps) { if (s.getBoundingClientRect().top <= th) cur = s.dataset.ym; else break; }
    return cur;
  };
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (grid.offsetParent === null) return;   // hidden (left the route) — every rect is 0 and topline would pick the LAST month, clobbering viewY/viewM
      const ym = topline();
      if (ym && ym !== lastYm) { lastYm = ym; onMonth(+ym.slice(0, 4), +ym.slice(5, 7) - 1); }
    });
  };
  grid.addEventListener('scroll', onScroll, { passive: true });          // compact: the grid scrolls internally
  _endlessOnScroll = onScroll;                                            // persistent listeners delegate to the CURRENT render's handler
  if (!_endlessWired) {
    _endlessWired = true;
    const relay = () => _endlessOnScroll && _endlessOnScroll();
    window.addEventListener('scroll', relay, { passive: true });          // normal mode: the page scrolls
    document.getElementById('main')?.addEventListener('scroll', relay, { passive: true });
  }
}
let _endlessWired = false, _endlessOnScroll = null;

// ---- month cockpit: up next · book by · tasks due ----
function sevOf(iso) { const d = daysBetween(TODAY, iso); if (d === null) return ''; if (d < 0) return 'overdue'; if (d <= 14) return 'due-soon'; return 'upcoming'; }
export function panelHTML() {
  const monthKey = `${viewY}-${pad(viewM + 1)}`;
  const isPast = monthKey < TODAY.slice(0, 7);
  const evs = allEvents().filter(visible);
  // full (uncapped) lists so the count badge + "+N more" are honest, then a display slice.
  // Up next = discrete upcoming events. Exclude the 'seasonal' category (this dataset's evergreen /
  // ongoing / permanent bucket — teamLab, "retro hunting"; genuinely-dated seasonal things use the
  // fireworks/festival/holiday/nature categories instead) AND any long-span residency (isEvergreen).
  const upAll = evs.filter(e => !isEvergreen(e) && catOf(e) !== 'seasonal' && e.date.slice(0, 7) === monthKey && e.date.slice(0, 10) >= TODAY)
    .sort((a, b) => a.date.localeCompare(b.date));
  const deadAll = evs.filter(e => e.bookBy && /^\d{4}-\d{2}-\d{2}$/.test(e.bookBy) && e.bookBy.slice(0, 7) <= monthKey && (e.endDate || e.date).slice(0, 10) >= TODAY)
    .sort((a, b) => a.bookBy.localeCompare(b.bookBy));
  const taskAll = allTasks().filter(t => t.date.slice(0, 7) === monthKey).sort((a, b) => a.date.localeCompare(b.date));
  const upnext = upAll.slice(0, 5), deadlines = deadAll.slice(0, 5), tasks = taskAll.slice(0, 6);
  const more = (total, shown) => total > shown ? `<button type="button" class="cp-more" data-goagenda>+${total - shown} more →</button>` : '';
  const count = (n) => n ? ` <span class="cp-count">${n}</span>` : '';

  const upHTML = upnext.length ? upnext.map(e => {
    const d = daysBetween(TODAY, e.date.slice(0, 10));
    const cd = d == null ? '' : d <= 0 ? 'now' : `${d}d`;
    return `<button class="cp-up" data-ev="${esc(e.id)}">
      <span class="cp-cd cat-${safeCat(e)}">${esc(cd)}<small>${esc(fmtShort(e.date))}</small></span>
      <span class="cp-uptt">${esc(e.title)}</span></button>`;
  }).join('') + more(upAll.length, upnext.length) : `<p class="cp-empty">${isPast ? 'This month has passed.' : 'Nothing more coming up this month.'}</p>`;

  const dlHTML = deadlines.length ? deadlines.map(e => {
    const sev = sevOf(e.bookBy), days = daysBetween(TODAY, e.bookBy);
    const badge = days < 0 ? 'overdue' : `${days}d`;
    return `<button class="cp-deadline" data-ev="${esc(e.id)}">
      <span class="cp-dot sev-${sev}"></span>
      <span class="cp-body"><span class="cp-title">${esc(e.title)}</span>
        <span class="cp-sub">book by ${esc(fmtShort(e.bookBy))}</span></span>
      <span class="cp-badge sev-${sev}">${esc(badge)}</span></button>`;
  }).join('') + more(deadAll.length, deadlines.length) : `<p class="cp-empty">Nothing to book${isPast ? '.' : " — you're clear 🎏"}</p>`;

  const taskHTML = tasks.length ? tasks.map(t => `<button class="cp-task" data-task="${esc(t.taskId)}" title="Open on the checklist">
    <span class="cp-tdue">${esc(fmtShort(t.date))}</span>
    <span class="cp-ttt">${esc(t.title)}</span>
    <span class="cp-tgo" aria-hidden="true">›</span></button>`).join('') + more(taskAll.length, tasks.length) : `<p class="cp-empty">No due dates — set them on the checklist.</p>`;

  return `<h3 class="cp-head">Up next</h3>
    <div class="cp-list">${upHTML}</div>
    <hr class="cp-hr"><h3 class="cp-head">Book by${count(deadAll.length)}</h3><div class="cp-list">${dlHTML}</div>
    <hr class="cp-hr"><h3 class="cp-head">Tasks due${count(taskAll.length)}</h3><div class="cp-list">${taskHTML}</div>`;
}
export function wirePanel() {
  $$('#calPanel .cp-up, #calPanel .cp-deadline').forEach(b => b.addEventListener('click', () => {
    const ev = allEvents().find(x => x.id === b.dataset.ev); if (ev) openSidePanel(ev, b);
  }));
  $$('#calPanel .cp-task').forEach(b => b.addEventListener('click', () => gotoTask(b.dataset.task)));
  $$('#calPanel .cp-more').forEach(b => b.addEventListener('click', () => goAgenda()));   // "+N more" → the full uncapped agenda
}

// ---- day popover ----
export function wireCells() {
  $$('#calView .cal-cell[data-day]').forEach(c => {
    // the .cal-date button is the keyboard-focusable trigger; its click bubbles here. A chip click
    // opens the event; on a day WITH items, a bare click peeks the day popover; on an EMPTY day it
    // goes straight to the new-event editor (Notion-style — no empty popover in the way).
    c.addEventListener('click', (e) => {
      if (_calDragSelected) { _calDragSelected = false; return; }              // a range-drag just ended — don't also add/peek
      const chip = e.target.closest('.cal-chip');
      if (chip) {
        if (chip.dataset.task) { gotoTask(chip.dataset.task); return; }     // task chip → jump to the checklist item
        const ev = allEvents().find(x => x.id === chip.dataset.ev); if (ev) openSidePanel(ev, chip); return;
      }
      if (c.querySelector('.cal-chip, .cal-more')) dayPopover(c.dataset.day, c);   // day has events/tasks → peek
      else openModal(null, c.dataset.day);                                        // empty day → add straight away
    });
  });
  // "Ongoing this season" strip pills → popover
  $$('#calView .cal-opill[data-ev]').forEach(b => b.addEventListener('click', () => {
    const ev = allEvents().find(x => x.id === b.dataset.ev); if (ev) openSidePanel(ev, b);
  }));
}
// Notion-style: drag across the month grid to select a date range → opens the editor pre-filled with
// that span. A plain click (no drag) falls through to wireCells (add / peek). Chips/date-buttons excluded.
let _calDragSelected = false;
export function wireMonthSelect() {
  const grid = $('#calView .cal-grid');
  if (!grid || grid.dataset.selWired) return;
  grid.dataset.selWired = '1';
  const cellAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('.cal-cell[data-day]');
  const clear = () => $$('#calView .cal-cell.cal-selecting').forEach(c => c.classList.remove('cal-selecting'));
  const paint = (a, b) => {
    const lo = a < b ? a : b, hi = a < b ? b : a;
    $$('#calView .cal-cell[data-day]').forEach(c => c.classList.toggle('cal-selecting', c.dataset.day >= lo && c.dataset.day <= hi));
  };
  let startDay = null, moved = false;
  grid.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.cal-chip, .cal-more, button, a')) return;   // let chips/date-button/more work
    const cell = e.target.closest('.cal-cell[data-day]'); if (!cell) return;
    startDay = cell.dataset.day; moved = false;
    try { grid.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
    paint(startDay, startDay);
  });
  grid.addEventListener('pointermove', (e) => {
    if (startDay == null) return;
    const cell = cellAt(e.clientX, e.clientY); if (!cell) return;
    if (cell.dataset.day !== startDay) moved = true;
    paint(startDay, cell.dataset.day);
  });
  const finish = (e) => {
    if (startDay == null) return;
    const endDay = cellAt(e.clientX, e.clientY)?.dataset.day || startDay;
    const s = startDay; startDay = null; clear();
    if (!moved || endDay === s) return;                              // plain click → wireCells handles it
    _calDragSelected = true; setTimeout(() => { _calDragSelected = false; }, 350);
    const lo = s < endDay ? s : endDay, hi = s < endDay ? endDay : s;
    openModal(null, lo, hi);
  };
  grid.addEventListener('pointerup', finish);
  grid.addEventListener('pointercancel', () => { startDay = null; clear(); });
}
// drag a USER event chip onto another day to reschedule (baked events are fixed)
export function wireReschedule() {
  const view = $('#calView');
  if (!view) return;
  makeMovable(view, {
    itemSelector: '.cal-chip[data-ev]', label: 'event',
    canDrag: () => true,                       // any event can be rescheduled now (baked → override layer)
    idOf: el => el.dataset.ev,
    targetSelector: '.cal-cell[data-day]', keyOf: t => t.dataset.day,
    onMove: rescheduleEvent,
  });
}
