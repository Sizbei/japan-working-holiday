'use strict';
// The declarative keyboard-binding registry — the single source of truth for the app's
// single-character shortcuts (K1 foundation of the Almanac Keyboard & QoL program). PURE and
// Node-import-safe: no DOM access at module load (the only import is store.js, whose localStorage
// reads are already guarded for Node). Consumers read this instead of scattering key literals:
//   - the study dispatcher (study.js wireRoot) routes through resolveKey()
//   - the ? help sheet + command palette (K3/K5) render each row's key from BINDINGS
//   - every bare-key listener consults shortcutsEnabled() (WCAG 2.1.4 turn-off gate)
//
// A binding: { id, keys[], phase, surface, label, control, kind, routed?, mod? }.
//   phase   — the app state the binding is live in ('global' | 'calendar' | 'checklist' | study card
//             phases 'input'/'close'/'graded'/'wrong' | 'any'). resolveKey matches on it so one key
//             (e.g. Enter, or the digit 1) can mean different things pre- vs post-answer.
//   surface — which module owns it ('global' | 'nav' | 'calendar' | 'checklist' | 'study'), which is
//             how the ? sheet groups the rows.
//   control — a selector for the visible, focusable control that performs the same action (every
//             action has a tap target — WCAG 2.1.1 — and the chips/aria-keyshortcuts hang off it).
//   kind    — nav | grade | reveal | media | integrity | edit | help.
//   routed  — omit (⇒ dispatched through resolveKey — every study binding) vs `false` (DECLARATIVE
//             ONLY: gestures.js / calendar.js / checklist-page.js keep their own handlers per the K1
//             incremental-adoption note; the entry exists so the ? sheet reads EVERY key from one
//             source — K3). The drift test resolves the routed subset; it never resolves routed:false.
//   mod     — `true` marks a modifier / chorded combo (⌘K, ⌘Z, ⇧←) whose `keys` are display glyphs
//             rather than raw event.key values (those combos are handled outside resolveKey).

import { getRaw, KEYS } from './store.js';

export const BINDINGS = [
  // ── Global (owned by gestures.js wireKeyboard). Listed here so the ? sheet / palette can read
  //    their keys; gestures keeps its own if/switch chain in K1 (incremental registry adoption), so
  //    every entry is routed:false — DECLARATIVE documentation, not resolveKey-dispatched.
  { id: 'help', keys: ['?'], phase: 'global', surface: 'global', label: 'Show keyboard shortcuts', control: '#kbdHelp', kind: 'help', routed: false },
  { id: 'palette', keys: ['/'], phase: 'global', surface: 'global', label: 'Command palette', control: null, kind: 'nav', routed: false },
  { id: 'palette-cmd', keys: ['⌘K', 'Ctrl+K'], phase: 'global', surface: 'global', label: 'Command palette', control: null, kind: 'nav', routed: false, mod: true },
  { id: 'undo-cmd', keys: ['⌘Z', 'Ctrl+Z'], phase: 'global', surface: 'global', label: 'Undo the last calendar delete', control: null, kind: 'integrity', routed: false, mod: true },
  { id: 'nav-page', keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], phase: 'global', surface: 'nav', label: 'Jump to a page', control: null, kind: 'pages', routed: false },
  { id: 'nav-prev', keys: ['['], phase: 'global', surface: 'nav', label: 'Previous page', control: null, kind: 'nav', routed: false },
  { id: 'nav-next', keys: [']'], phase: 'global', surface: 'nav', label: 'Next page', control: null, kind: 'nav', routed: false },
  { id: 'nav-emergency', keys: ['0'], phase: 'global', surface: 'nav', label: 'Emergency page', control: null, kind: 'nav', routed: false },
  { id: 'nav-notif', keys: ['b'], phase: 'global', surface: 'nav', label: 'Notifications', control: '#notifBell', kind: 'nav', routed: false },
  { id: 'nav-theme', keys: ['\\'], phase: 'global', surface: 'nav', label: 'Light / dark theme', control: '#themeToggle', kind: 'nav', routed: false },
  { id: 'nav-guide', keys: [','], phase: 'global', surface: 'nav', label: 'Guide & settings', control: '#guideBtn', kind: 'nav', routed: false },

  // ── Calendar (owned by calendar.js onCalKeydown — its OWN keydown handler, NOT routed through
  //    resolveKey; these mirror that handler so the ? sheet documents them from the one registry).
  { id: 'cal-view-month', keys: ['m'], phase: 'calendar', surface: 'calendar', label: 'Month view', control: '#calModeMonth', kind: 'nav', routed: false },
  { id: 'cal-view-week', keys: ['w'], phase: 'calendar', surface: 'calendar', label: 'Week view', control: '#calModeWeek', kind: 'nav', routed: false },
  { id: 'cal-view-day', keys: ['d'], phase: 'calendar', surface: 'calendar', label: 'Day view', control: '#calModeDay', kind: 'nav', routed: false },
  { id: 'cal-view-agenda', keys: ['a'], phase: 'calendar', surface: 'calendar', label: 'Agenda view', control: '#calModeAgenda', kind: 'nav', routed: false },
  { id: 'cal-new', keys: ['n'], phase: 'calendar', surface: 'calendar', label: 'New event on the focused day', control: '#calAdd', kind: 'edit', routed: false },
  { id: 'cal-today', keys: ['t'], phase: 'calendar', surface: 'calendar', label: 'Jump to today', control: '#calToday', kind: 'nav', routed: false },
  { id: 'cal-find', keys: ['f'], phase: 'calendar', surface: 'calendar', label: 'Find / quick-add an event', control: '#calCmd', kind: 'nav', routed: false },
  { id: 'cal-move', keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'], phase: 'calendar', surface: 'calendar', label: 'Move between days (month view)', control: null, kind: 'nav', routed: false },
  { id: 'cal-step', keys: ['⇧←', '⇧→'], phase: 'calendar', surface: 'calendar', label: 'Previous / next month (or week)', control: '#calPrev', kind: 'nav', routed: false, mod: true },
  { id: 'cal-remove', keys: ['-', 'Delete', 'Backspace'], phase: 'calendar', surface: 'calendar', label: 'Remove the focused / open event', control: null, kind: 'edit', routed: false },

  // ── Checklist (owned by checklist-page.js onCheckKeydown — its OWN handler; Space is the browser's
  //    native toggle on the focused task checkbox, so it has no explicit handler entry there).
  { id: 'check-move', keys: ['ArrowUp', 'ArrowDown', 'j', 'k'], phase: 'checklist', surface: 'checklist', label: 'Move between tasks', control: null, kind: 'nav', routed: false },
  { id: 'check-tick', keys: [' '], phase: 'checklist', surface: 'checklist', label: 'Tick / untick the focused task', control: null, kind: 'edit', routed: false },
  { id: 'check-due', keys: ['d'], phase: 'checklist', surface: 'checklist', label: 'Set a due date', control: '.ci-due', kind: 'edit', routed: false },
  { id: 'check-priority', keys: ['p'], phase: 'checklist', surface: 'checklist', label: 'Cycle priority (P1→P4)', control: '.ci-flag', kind: 'edit', routed: false },
  { id: 'check-edit', keys: ['e'], phase: 'checklist', surface: 'checklist', label: 'Edit your own task', control: '.check-edit', kind: 'edit', routed: false },
  { id: 'check-remove', keys: ['-', 'Delete', 'Backspace'], phase: 'checklist', surface: 'checklist', label: 'Remove your own task', control: '.check-del', kind: 'edit', routed: false },

  // ── Study, pre-answer (typed cloze). Enter is the reveal/submit — it is NOT a printable typing
  //    key, so it commands even while the kana input is focused (unlike bare letters/digits).
  { id: 'submit', keys: ['Enter'], phase: 'input', surface: 'study', label: 'Check answer', control: '[data-act="check"]', kind: 'reveal' },

  // ── Study, close-match confirm
  { id: 'accept', keys: ['Enter'], phase: 'close', surface: 'study', label: 'Take it', control: '[data-act="accept"]', kind: 'grade' },
  { id: 'reject', keys: ['Escape'], phase: 'close', surface: 'study', label: 'Reveal instead', control: '[data-act="reject"]', kind: 'reveal' },

  // ── Study, post-answer grade (correct). Only Hard/Good/Easy — a correct answer has no "Again"
  //    (matches the graded control bar; `1` stays unbound here, so it never becomes a control-less
  //    keyboard-only grade). The wrong-phase Continue is a separate binding below.
  { id: 'grade-2', keys: ['2'], phase: 'graded', surface: 'study', label: 'Hard', control: '[data-g="2"]', kind: 'grade' },
  { id: 'grade-3', keys: ['3'], phase: 'graded', surface: 'study', label: 'Good', control: '[data-g="3"]', kind: 'grade' },
  { id: 'grade-4', keys: ['4'], phase: 'graded', surface: 'study', label: 'Easy', control: '[data-g="4"]', kind: 'grade' },
  { id: 'grade-default', keys: ['Enter'], phase: 'graded', surface: 'study', label: 'Good (default)', control: null, kind: 'grade' },

  // ── Study, post-answer (wrong). Space/Enter advance ONLY when a control is not focused (else the
  //    focused Continue button activates natively — resolveKey returns null for Enter/Space on a
  //    button to avoid the double-advance).
  { id: 'advance', keys: ['Enter', ' '], phase: 'wrong', surface: 'study', label: 'Continue', control: '[data-act="again"]', kind: 'nav' },

  // ── Study audio (K2a). R replays the current card's example sentence — POST-ANSWER ONLY (the
  //    sentence contains the answer, so it is scoped to the reveal phases 'graded'/'wrong' where the
  //    音 button renders, never pre-answer/'input'/'close'). It is a bare letter, so rule 3 of
  //    resolveKey already blocks it while the kana input is focused. R needs one entry per reveal
  //    phase (ids stay unique — the K1 registry invariant); both route to the same speak handler.
  //    A toggles autoplay and is scoped to 'idle' (the course home) — the ONLY view where the visible
  //    .stu-tts-toggle control exists, so the key keeps keyboard/touch parity (Principle 5). Mid-
  //    session A is intentionally unbound (a keyboard action must not fire where it has no control).
  { id: 'speak-graded', keys: ['r', 'R'], phase: 'graded', surface: 'study', label: 'Replay audio', control: '.stu-speak', kind: 'media' },
  { id: 'speak-wrong', keys: ['r', 'R'], phase: 'wrong', surface: 'study', label: 'Replay audio', control: '.stu-speak', kind: 'media' },
  { id: 'autoplay', keys: ['a', 'A'], phase: 'idle', surface: 'study', label: 'Toggle autoplay', control: '.stu-tts-toggle', kind: 'media' },

  // ── Study integrity (K2b). Z undoes the LAST grade — bounded to within-session (the summary's
  //    sessionEnd/recordSession is post-window, so the shell no-ops Z once state.session is null).
  //    Scoped to the reveal phases 'graded'/'wrong' (the just-answered card, focus on a grade/Continue
  //    BUTTON — a bare letter still commands on a button, but rule 3 keeps it from firing over the
  //    focused kana input, so it is NOT bound in 'input': "nothing to undo yet"). The always-available
  //    tap/Tab path is the visible .stu-undo affordance in the card header (Principle 5). Undo is not
  //    offered while a ★-scramble / MCQ card owns the keyboard (cardCtl intercepts before resolveKey).
  { id: 'undo-graded', keys: ['z', 'Z'], phase: 'graded', surface: 'study', label: 'Undo last grade', control: '.stu-undo', kind: 'integrity' },
  { id: 'undo-wrong', keys: ['z', 'Z'], phase: 'wrong', surface: 'study', label: 'Undo last grade', control: '.stu-undo', kind: 'integrity' },

  // ── Study session wrap-up (K2b). The end-of-session summary's primary button is focused, so Enter
  //    activates it natively (resolveKey returns null for Enter on a BUTTON). This entry keeps a
  //    keyboard path even if focus drifts off the button, and documents the flow for the ? sheet.
  { id: 'summary-done', keys: ['Enter'], phase: 'summary', surface: 'study', label: 'Done — back to course home', control: '[data-act="done"]', kind: 'nav' },

  // ── Mock exam (K4a). Owned by study-exam.js, NOT resolveKey-dispatched (every entry routed:false,
  //    surface !== 'study'), so this is declarative documentation for the ? sheet. Two handler paths:
  //    the runner's own onKey handles the PRINTABLE keys (F flag, 1–4 pick/place) — WCAG-gated because
  //    study.js only forwards activeFlow.onKey while shortcutsEnabled() — while a dedicated run-container
  //    listener handles the 2.1.4-EXEMPT nav keys (←/→ question, palette arrows/Home/End, Enter submit,
  //    Esc exit) so they stay live even when the shortcut toggle is off (native controls never die).
  //    Every action has a visible tap control (the run bar's flag/exit, prev/next/submit buttons, and
  //    the palette cells). Digits 1–4 also mean "jump to a page" on the nav surface — no conflict: the
  //    exam owns the keyboard via activeFlow while running, and the ? sheet groups them separately.
  { id: 'exam-flag', keys: ['f', 'F'], phase: 'exam', surface: 'exam', label: 'Flag / unflag this question', control: '.stu-mock-flag', kind: 'edit', routed: false },
  { id: 'exam-prev', keys: ['ArrowLeft'], phase: 'exam', surface: 'exam', label: 'Previous question', control: '[data-act="examPrev"]', kind: 'nav', routed: false },
  { id: 'exam-next', keys: ['ArrowRight'], phase: 'exam', surface: 'exam', label: 'Next question', control: '[data-act="examNext"]', kind: 'nav', routed: false },
  { id: 'exam-pick', keys: ['1', '2', '3', '4'], phase: 'exam', surface: 'exam', label: 'Pick an answer / place a piece', control: '.stu-mc-opt, .stu-tile', kind: 'grade', routed: false },
  { id: 'exam-palette', keys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'], phase: 'exam', surface: 'exam', label: 'Move within the question palette', control: '.stu-mock-pcell', kind: 'nav', routed: false },
  { id: 'exam-submit', keys: ['Enter'], phase: 'exam', surface: 'exam', label: 'Submit for scoring (when complete)', control: '.stu-mock-submit', kind: 'nav', routed: false },
  { id: 'exam-exit', keys: ['Escape'], phase: 'exam', surface: 'exam', label: 'Exit the mock (with confirm)', control: '[data-act="examExit"]', kind: 'nav', routed: false },

  // ── Progress · mastery heat grid (K4b). Owned by study-stats.js's grid-container listener, NOT
  //    resolveKey-dispatched (every entry routed:false, surface !== 'study') — declarative documentation
  //    for the ? sheet. The 353-cell grid is ONE roving-tabindex composite, so every key here is a
  //    WCAG-2.1.4-EXEMPT named key (arrows / Home / End / Ctrl+Home / Ctrl+End / PageUp / PageDown /
  //    Enter) that stays live even when the shortcut toggle is off — none is a bare printable char.
  //    Enter opens the focused cell's detail via native <button> activation (no explicit dispatch), so
  //    it is documented, not handled in the keydown listener (avoids a double-fire). Each cell is a real
  //    focusable, tappable control (Principle 5). Up/Down move by VISUAL column (fluid wrap — computed
  //    from layout rects); Home/End walk the level group; PageUp/Down jump whole levels; Ctrl+Home/End
  //    jump the ends of the whole map.
  { id: 'grid-move', keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'], phase: 'stats', surface: 'stats', label: 'Move around the mastery map', control: '.stu-hc[data-act="hcCell"]', kind: 'nav', routed: false },
  { id: 'grid-row-ends', keys: ['Home', 'End'], phase: 'stats', surface: 'stats', label: 'First / last point in this level', control: null, kind: 'nav', routed: false },
  { id: 'grid-ends', keys: ['⌃Home', '⌃End', '⌘Home', '⌘End'], phase: 'stats', surface: 'stats', label: 'First / last point in the whole map', control: null, kind: 'nav', routed: false, mod: true },
  { id: 'grid-page', keys: ['PageUp', 'PageDown'], phase: 'stats', surface: 'stats', label: 'Jump to the previous / next level', control: null, kind: 'nav', routed: false },
  { id: 'grid-open', keys: ['Enter', ' '], phase: 'stats', surface: 'stats', label: 'Open the point (drill it)', control: '.stu-hc[data-act="hcCell"]', kind: 'nav', routed: false },
];

// The pure resolver. Takes the already-computed active-element KIND (no DOM) so it is unit-testable.
//   { key, phase, targetKind, composing, enabled } → actionId | null
//   targetKind ∈ 'input' (INPUT/TEXTAREA/SELECT/contenteditable) | 'button' | 'other'.
// Rules (in order):
//   1. shortcuts turned off → null (WCAG 2.1.4 turn-off).
//   2. IME composing → null (never command mid-変換).
//   3. a printable single-char key over a text field must TYPE, not command → null. (Enter/Escape
//      and other named keys are NOT printable, so they still command inside the input — that is how
//      Enter submits while the kana field is focused.)
//   4. no (key, phase) binding → null.
//   5. Enter/Space on a focused BUTTON → null: the browser already activates it natively; a second
//      dispatch here would double-advance/double-grade.
export function resolveKey({ key, phase, targetKind = 'other', composing = false, enabled = true } = {}) {
  if (!enabled) return null;
  if (composing) return null;
  if (targetKind === 'input' && typeof key === 'string' && key.length === 1) return null;
  const b = BINDINGS.find(x => x.keys.includes(key) && (x.phase === phase || x.phase === 'any'));
  if (!b) return null;
  if (targetKind === 'button' && (key === 'Enter' || key === ' ')) return null;
  return b.id;
}

// The shared WCAG 2.1.4 (Level A) turn-off gate. Default ON: an empty/unset sentinel means on,
// only the literal 'off' disables. Every bare-single-char listener consults this so ONE toggle in
// Guide & Settings silences the whole single-key surface (native Tab/Enter/Space controls stay).
export function shortcutsEnabled() { return getRaw(KEYS.kbd, '') !== 'off'; }

// ── K3: the ? sheet renders FROM the registry ────────────────────────────────
// helpSheetModel is the single source of truth for what the ? sheet lists — a drift test asserts the
// model ⇔ BINDINGS ⇔ resolveKey stay in lock-step for the ROUTED (study) surface, so a study key
// added without documenting it (or vice-versa) fails CI. The routed:false entries (global/calendar/
// checklist) are hand-mirrored from their own handlers — the test can't see those, so a key added to
// onCalKeydown/onCheckKeydown/wireKeyboard still needs a matching entry here by convention.
const SURFACE_TITLES = {
  global: 'General',
  nav: 'Getting around',
  calendar: 'On the calendar',
  checklist: 'On the checklist',
  study: 'Studying grammar (文法帖)',
  exam: 'In a mock exam',
  stats: 'On the mastery map',
};
const SURFACE_ORDER = ['global', 'nav', 'calendar', 'checklist', 'study', 'exam', 'stats'];

// Display glyphs for the ? sheet's <kbd> chips. Raw event.key values → readable symbols; modifier
// combos (mod:true bindings) already carry display strings in their keys, so they pass through.
const KEY_GLYPH = {
  Enter: '⏎', ' ': 'Space', Escape: 'Esc',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Delete: 'Del', Backspace: '⌫', '-': '−',
  PageUp: 'PgUp', PageDown: 'PgDn', Home: 'Home', End: 'End',
};
export function keyGlyph(k) { return KEY_GLYPH[k] || k; }

// Pure: turn the registry into the ordered, grouped rows the ? sheet renders. ONE row per distinct
// action — bindings that share a label (e.g. the graded/wrong replay-audio pair) collapse into a
// single row carrying every covering id. The dynamic page-jump binding (kind:'pages') expands against
// the caller-supplied `pages` [{key,label}] so 1–9 read as their live nav labels; with no pages it
// falls back to one generic row. Rows list the same keys whether shortcuts are on or off — `enabled`
// is passed through only so the caller can theme the disabled banner; the model itself is unchanged.
export function helpSheetModel(bindings, { enabled = true, pages = null } = {}) {   // eslint-disable-line no-unused-vars
  const bySurface = new Map();
  const groupFor = (s) => {
    let g = bySurface.get(s);
    if (!g) { g = { surface: s, title: SURFACE_TITLES[s] || s, rows: [] }; bySurface.set(s, g); }
    return g;
  };
  for (const b of bindings) {
    const g = groupFor(b.surface);
    if (b.kind === 'pages' && Array.isArray(pages) && pages.length) {
      for (const p of pages) g.rows.push({ keys: [p.key], label: p.label, ids: [b.id] });
      continue;
    }
    const row = g.rows.find(r => r.label === b.label);
    if (row) { row.ids.push(b.id); for (const k of b.keys) if (!row.keys.includes(k)) row.keys.push(k); }
    else g.rows.push({ keys: [...b.keys], label: b.label, ids: [b.id] });
  }
  const known = SURFACE_ORDER.filter(s => bySurface.has(s));
  const extra = [...bySurface.keys()].filter(s => !SURFACE_ORDER.includes(s));
  return [...known, ...extra].map(s => bySurface.get(s));
}
