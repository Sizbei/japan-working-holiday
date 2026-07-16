'use strict';
import { $, $$, esc } from './lib/dom.js';
import { daysBetween, fmtShort, parseISO } from './lib/dates.js';
import { isMultiDay, fmt12 } from './lib/weekgrid.js';
import { monthGrid } from './lib/minical.js';
import { makeMovable } from './dnd.js';
import { viewY, viewM, TODAY, allEvents, visible, catOf, safeCat, tasksOn, taskChipHTML, allTasks, isEvergreen, openModal, openSidePanel, dayPopover, gotoTask, birthdaysOn, birthdayChipHTML, gotoPerson, rescheduleEvent, goAgenda, goWeek } from './calendar.js';

function pad(n) { return String(n).padStart(2, '0'); }

const MONTH_SINGLES = 4;      // rows per cell — all chips, or 3 chips + "+N more" as the 4th row

// ENDLESS month: one continuous week-grid spanning the whole data range (the trip year —
// ~60 weeks, cheap enough to render whole; no virtual windowing). Month-separator rows sit above
// the week containing each 1st; the coordinator watches scroll and updates the label / mini-nav /
// cockpit to the month at the top of the viewport. Multi-day events chip on every covered day,
// Notion-style ("‹" when continuing from an earlier day). Evergreen spans are dropped from the grid
// (see the filter below) and reachable via the Find/add search popover + agenda, not a strip.
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const addDaysISO = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// TRUE infinite scroll: the grid renders a WINDOW of months (not the whole data range), tight around
// today, and extends on demand as you scroll to either end — so there's no hard April "wall". The
// window is module state so extensions persist across re-renders / route re-entry.
const stepYM = (ym, n) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const CAL_CHUNK = 6;          // months added each time you reach an edge
const CAL_CAP = 72;          // don't auto-extend past ~6 years either side of today (bounds the DOM)
let _winLo = null, _winHi = null;   // YYYY-MM, inclusive
function initWindow() { const t = TODAY.slice(0, 7); _winLo = stepYM(t, -2); _winHi = stepYM(t, 14); }   // a little lead-in, ~15 months ahead
export function calWindow() { if (_winLo === null) initWindow(); return { lo: _winLo, hi: _winHi }; }
// widen the window one chunk (today always stays inside — we only widen). Returns true if it changed;
// stops at CAL_CAP so a pinned edge-scroll can't grow the DOM without bound.
export function extendWindow(dir) {
  if (_winLo === null) initWindow();
  const t = TODAY.slice(0, 7);
  if (dir < 0) { const n = stepYM(_winLo, -CAL_CHUNK); if (n < stepYM(t, -CAL_CAP)) return false; _winLo = n; return true; }
  const n = stepYM(_winHi, CAL_CHUNK); if (n > stepYM(t, CAL_CAP)) return false; _winHi = n; return true;
}
// explicit jumps (Prev/Next, quick-add, mini-cal) can target a month outside the window — widen to
// include it (no cap: the user asked to go there). Returns true if the window changed.
export function ensureWindowCovers(ym) {
  if (_winLo === null) initWindow();
  let changed = false;
  while (ym < _winLo) { _winLo = stepYM(_winLo, -CAL_CHUNK); changed = true; }
  while (ym > _winHi) { _winHi = stepYM(_winHi, CAL_CHUNK); changed = true; }
  return changed;
}
// anchor the current scroll to a day cell at the READING LINE (middle of the VISIBLE grid, below the
// sticky topbar/nav) so a prepend/append doesn't jump. Reuses topline()'s probe point on purpose —
// a fixed top+Npx offset would land inside the sticky chrome in window-scroll mode.
export function captureAnchor() {
  const grid = $('#calView .cal-grid'); if (!grid) return null;
  const gr = grid.getBoundingClientRect();
  const x = gr.left + gr.width / 2;
  const y = (Math.max(gr.top, 0) + Math.min(gr.bottom, window.innerHeight)) / 2;
  const cell = document.elementFromPoint(x, y)?.closest?.('.cal-cell[data-day]');
  if (!cell) return null;
  return { day: cell.dataset.day, offset: cell.getBoundingClientRect().top - gr.top };
}
export function restoreAnchor(a) {
  if (!a) return;
  const grid = $('#calView .cal-grid'); if (!grid) return;
  const cell = grid.querySelector(`.cal-cell[data-day="${a.day}"]`); if (!cell) return;
  const delta = (cell.getBoundingClientRect().top - grid.getBoundingClientRect().top) - a.offset;
  if (grid.scrollHeight > grid.clientHeight + 4) grid.scrollTop += delta; else window.scrollBy(0, delta);
}

export function monthHTML() {
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const { lo, hi } = calWindow();
  const rangeStart = (() => { const first = lo + '-01'; const dow = new Date(first + 'T00:00:00Z').getUTCDay(); return addDaysISO(first, -dow); })();
  const lastDay = (() => { const d = new Date(Date.UTC(+hi.slice(0, 4), +hi.slice(5, 7), 0)); return d.toISOString().slice(0, 10); })();
  const rangeEnd = (() => { const dow = new Date(lastDay + 'T00:00:00Z').getUTCDay(); return addDaysISO(lastDay, 6 - dow); })();

  const evs = allEvents().filter(visible);
  // evergreen (season-long / 'seasonal') events stay OUT of the day grid (they'd flood every cell).
  // The "Ongoing this season" strip that used to surface them was removed for vertical space
  // (owner) — they remain reachable via the Find/add search popover and the agenda view.

  // multi-day (non-evergreen): a chip on EVERY covered day, Notion-style ("‹" = continuing from an
  // earlier day) — so a mid-stay day counts the span toward the chip cap and "+N more" like Notion's bars
  const spansByDay = new Map();   // iso → [{ ev, cont, end }]
  const singlesByDay = new Map();
  for (const e of evs) {
    if (isEvergreen(e)) continue;
    // parseISO-guard the end like eventsOn does — a corrupted endDate ('2026-13-05') would otherwise
    // pass the lexical comparisons and flood a chip onto every day through the end of the range
    const s = e.date.slice(0, 10), en = (e.endDate && parseISO(e.endDate)) ? e.endDate.slice(0, 10) : s;
    if (!isMultiDay(e)) {
      if (!singlesByDay.has(s)) singlesByDay.set(s, []);
      singlesByDay.get(s).push(e);
      continue;
    }
    let d = s < rangeStart ? rangeStart : s;
    const stop = en > rangeEnd ? rangeEnd : en;
    while (d <= stop) {
      if (!spansByDay.has(d)) spansByDay.set(d, []);
      spansByDay.get(d).push({ ev: e, cont: d > s, end: en });
      d = addDaysISO(d, 1);
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
    const multis = spansByDay.get(date) || [];
    const tks = tasksOn(date);
    const bds = birthdaysOn(date);
    const hasBook = singles.some(e => e.bookBy);
    // spans first (Notion stacks its bars above the day's own events), then timed singles, birthdays, tasks
    const items = [...multis, ...singles.map(e => ({ ev: e })), ...bds.map(b => ({ bd: b })), ...tks.map(t => ({ tk: t }))];
    // "+N more" REPLACES the last row (owner: 4 rows per cell, the 4th IS the count when a day
    // overflows) — never a 5th row that compact's fixed row height clips into invisibility
    const shown = items.length > MONTH_SINGLES ? MONTH_SINGLES - 1 : items.length;
    const chips = items.slice(0, shown).map(x => {
      if (x.tk) return taskChipHTML(x.tk);
      if (x.bd) return birthdayChipHTML(x.bd);
      const e = x.ev;
      // end date only on the span's START chip — repeating "→ Jul 10" on every covered day ate the
      // titles; continuation days carry just a faint "‹" (the quieter .cont fill says the rest)
      const range = x.end && !x.cont ? `<span class="cc-range">→ ${esc(fmtShort(x.end))}</span>` : '';
      const cont = x.cont ? '<span class="cc-cont" aria-hidden="true">‹</span>' : '';
      const tm = x.end ? '' : fmt12(e.time);
      const time = tm ? `<span class="cc-time">${esc(tm)}</span>` : '';
      return `<button class="cal-chip cat-${esc(catOf(e))}${tm ? ' timed' : ''}${x.cont ? ' cont' : ''}" data-ev="${esc(e.id)}" title="${esc(e.title)}">${cont}${time}<span class="cc-t">${esc(e.title)}</span>${range}</button>`;
    }).join('');
    const moreN = items.length - shown;
    const more = moreN > 0 ? `<button type="button" class="cal-more" data-day="${esc(date)}">+${moreN} more</button>` : '';
    const bk = hasBook ? `<span class="bk-dot" role="img" aria-label="has a booking deadline" title="has a booking deadline"></span>` : '';
    const nEv = singles.length + multis.length;
    const aria = `${esc(date)}, ${nEv} event${nEv === 1 ? '' : 's'}${tks.length ? `, ${tks.length} task${tks.length === 1 ? '' : 's'}` : ''}`;
    const dayN = date.slice(8, 10).replace(/^0/, '');
    const label = date.slice(8, 10) === '01' ? `${esc(MONTHS_LONG[+date.slice(5, 7) - 1])} ${dayN}` : dayN;   // "July 1" — the inline month transition (Notion-style)
    const cls = ['cal-cell', isToday && 'today', past && 'past', weekend && 'weekend'].filter(Boolean).join(' ');
    cells += `<div class="${cls}" data-day="${esc(date)}">
      <span class="cal-row"><button type="button" class="cal-date" data-day="${esc(date)}" aria-label="${aria}">${label}</button>${bk}</span>
      ${chips}${more}</div>`;
    day = addDaysISO(day, 1); i++;
  }
  return `<div class="cal-dowrow">${dows.map(x => `<div class="cal-dow">${esc(x)}</div>`).join('')}</div><div class="cal-grid cal-endless">${cells}</div>`;
}

// ---- endless-scroll reactions ----
function scrollTargetTo(el, smooth, align) {
  if (!el) return;
  const grid = $('#calView .cal-grid');
  const behavior = smooth ? 'smooth' : 'auto';
  if (grid && grid.scrollHeight > grid.clientHeight + 4) {
    // compact: the grid scrolls internally — scrollIntoView scrolls EVERY ancestor and would
    // drag the window past the app shell (footer sliver); move only the grid
    const delta = el.getBoundingClientRect().top - grid.getBoundingClientRect().top
      - (align === 'center' ? (grid.clientHeight - el.getBoundingClientRect().height) / 2 : 0);
    grid.scrollTo({ top: grid.scrollTop + delta, behavior });
  } else {
    el.scrollIntoView({ behavior, block: align });   // normal mode: the window scrolls (scroll-margin clears the sticky chrome)
  }
}
export function scrollToMonth(ym, smooth) { scrollTargetTo($(`#calView .cal-msep[data-ym="${ym}"]`), smooth, 'start'); }
export function scrollToDay(iso, smooth) { scrollTargetTo($(`#calView .cal-cell[data-day="${iso}"]`), smooth, 'center'); }
// watch scrolling; report the month whose separator is closest above the viewport top → the
// coordinator updates label / mini-nav / cockpit ("the rest of the page reacts").
export function wireEndless(onMonth, onExtend) {
  const grid = $('#calView .cal-grid'); if (!grid) return;
  let raf = 0, lastYm = '';
  // infinite scroll: -1 when within ~a screen of the top, +1 near the bottom, else 0. Works in both
  // scroll modes (internal grid ≥821px, window <821px).
  const nearEdge = () => {
    if (grid.scrollHeight > grid.clientHeight + 4) {   // internal grid scroll
      if (grid.scrollTop < 500) return -1;
      if (grid.scrollTop > grid.scrollHeight - grid.clientHeight - 500) return 1;
      return 0;
    }
    const cells = grid.querySelectorAll('.cal-cell[data-day]');
    if (!cells.length) return 0;
    if (cells[0].getBoundingClientRect().top > -500) return -1;
    if (cells[cells.length - 1].getBoundingClientRect().bottom < window.innerHeight + 500) return 1;
    return 0;
  };
  const topline = () => {
    // month of the day cell at the READING LINE (middle of the grid's visible box, middle
    // column). The sentinels mark week TOPS and a week can straddle two months — the cell
    // under the line is what the user is actually looking at, in both scroll modes.
    const gr = grid.getBoundingClientRect();
    const x = gr.left + gr.width / 2;
    const y = (Math.max(gr.top, 0) + Math.min(gr.bottom, window.innerHeight)) / 2;
    const day = document.elementFromPoint(x, y)?.closest?.('.cal-cell[data-day]')?.dataset.day;
    if (day) return day.slice(0, 7);
    // fallback (overlay under the line, empty region): last month sentinel above it
    const seps = $$('#calView .cal-msep');
    if (!seps.length) return '';
    let cur = seps[0].dataset.ym;
    for (const s of seps) { if (s.getBoundingClientRect().top <= y) cur = s.dataset.ym; else break; }
    return cur;
  };
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (grid.offsetParent === null) return;   // hidden (left the route) — every rect is 0 and topline would pick the LAST month, clobbering viewY/viewM
      const ym = topline();
      if (ym && ym !== lastYm) { lastYm = ym; onMonth(+ym.slice(0, 4), +ym.slice(5, 7) - 1); }
      if (onExtend && !_extending) {   // grow the window when you reach an end (anchored re-render, no jump)
        const dir = nearEdge();
        const now = Date.now();
        if (dir && now - _lastExtend > 200) {   // cooldown: a pinned edge-scroll can't extend every frame
          _lastExtend = now; _extending = true; try { onExtend(dir); } finally { _extending = false; }
        }
      }
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
let _endlessWired = false, _endlessOnScroll = null, _extending = false, _lastExtend = 0;

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
      if (_plainClickDone) { _plainClickDone = false; return; }               // finish() already handled this click (pointer-capture fallback browsers)
      // date number or "+N more" → zoom into that WEEK — POINTER only (e.detail 0 = keyboard
      // activation, which keeps the popover: it has tasks, per-event +G and add-event that the
      // week view lacks — the only keyboard path to them)
      if (e.detail > 0 && e.target.closest('.cal-date, .cal-more')) { goWeek(c.dataset.day); return; }
      const chip = e.target.closest('.cal-chip');
      if (chip) {
        if (chip.dataset.task) { gotoTask(chip.dataset.task); return; }     // task chip → jump to the checklist item
        if (chip.dataset.person) { gotoPerson(chip.dataset.person); return; }   // birthday chip → open that person
        const ev = allEvents().find(x => x.id === chip.dataset.ev); if (ev) openSidePanel(ev, chip); return;
      }
      if (c.querySelector('.cal-chip, .cal-more')) dayPopover(c.dataset.day, c);   // day has events/tasks → peek (pointer path; keyboard = Enter on the date → week)
      else openModal(null, c.dataset.day);                                        // empty day → add straight away
    });
  });
}
// Notion-style: drag across the month grid to select a date range → opens the editor pre-filled with
// that span. A plain click (no drag) falls through to wireCells (add / peek). Chips/date-buttons excluded.
let _calDragSelected = false;
let _plainClickDone = false;   // set by finish()'s plain-click branch; consumed by the cell click listener
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
    if (!moved || endDay === s) {
      // plain click on the cell BODY. setPointerCapture retargets the ensuing click at the GRID,
      // so the per-cell click listener never fires for real pointers — handle the peek/add here.
      // (Chips/buttons never reach this: pointerdown skips them, so their own clicks still work.)
      const cell = $(`#calView .cal-cell[data-day="${s}"]`);
      if (cell) {
        _plainClickDone = true; setTimeout(() => { _plainClickDone = false; }, 0);   // if capture FAILED, the click still lands on the cell — don't double-handle
        if (cell.querySelector('.cal-chip, .cal-more')) dayPopover(s, cell);   // day has items → peek
        else openModal(null, s);                                               // empty day → add
      }
      return;
    }
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
    // .cont excluded: rescheduleEvent snaps the START to the drop day, so a continuation chip as a
    // drag handle would teleport the whole span (and a >6px wobble released on its own day shifts it)
    itemSelector: '.cal-chip[data-ev]:not(.cont)', label: 'event',
    canDrag: () => true,                       // any event can be rescheduled now (baked → override layer)
    idOf: el => el.dataset.ev,
    targetSelector: '.cal-cell[data-day]', keyOf: t => t.dataset.day,
    onMove: rescheduleEvent,
  });
}
