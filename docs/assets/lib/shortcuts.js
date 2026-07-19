'use strict';
// The declarative keyboard-binding registry — the single source of truth for the app's
// single-character shortcuts (K1 foundation of the Almanac Keyboard & QoL program). PURE and
// Node-import-safe: no DOM access at module load (the only import is store.js, whose localStorage
// reads are already guarded for Node). Consumers read this instead of scattering key literals:
//   - the study dispatcher (study.js wireRoot) routes through resolveKey()
//   - the ? help sheet + command palette (K3/K5) render each row's key from BINDINGS
//   - every bare-key listener consults shortcutsEnabled() (WCAG 2.1.4 turn-off gate)
//
// A binding: { id, keys[], phase, surface, label, control, kind }.
//   phase   — the app state the binding is live in ('global' | study card phases 'input'/'close'/
//             'graded'/'wrong' | 'any'). resolveKey matches on it so one key (e.g. Enter, or the
//             digit 1) can mean different things pre- vs post-answer.
//   surface — which module owns it ('global' | 'nav' | 'study'), for grouping the ? sheet.
//   control — a selector for the visible, focusable control that performs the same action (every
//             action has a tap target — WCAG 2.1.1 — and the chips/aria-keyshortcuts hang off it).
//   kind    — nav | grade | reveal | media | integrity | help (K1 seeds nav/grade/reveal/help).

import { getRaw, KEYS } from './store.js';

export const BINDINGS = [
  // ── Global (owned by gestures.js wireKeyboard). Listed here so the ? sheet / palette can read
  //    their keys; gestures keeps its own if/switch chain in K1 (incremental registry adoption).
  { id: 'help', keys: ['?'], phase: 'global', surface: 'global', label: 'Show keyboard shortcuts', control: '#kbdHelp', kind: 'help' },
  { id: 'palette', keys: ['/'], phase: 'global', surface: 'global', label: 'Command palette', control: null, kind: 'nav' },
  { id: 'nav-prev', keys: ['['], phase: 'global', surface: 'nav', label: 'Previous page', control: null, kind: 'nav' },
  { id: 'nav-next', keys: [']'], phase: 'global', surface: 'nav', label: 'Next page', control: null, kind: 'nav' },
  { id: 'nav-emergency', keys: ['0'], phase: 'global', surface: 'nav', label: 'Emergency page', control: null, kind: 'nav' },
  { id: 'nav-notif', keys: ['b'], phase: 'global', surface: 'nav', label: 'Notifications', control: '#notifBell', kind: 'nav' },
  { id: 'nav-theme', keys: ['\\'], phase: 'global', surface: 'nav', label: 'Light / dark theme', control: '#themeToggle', kind: 'nav' },
  { id: 'nav-guide', keys: [','], phase: 'global', surface: 'nav', label: 'Guide & settings', control: '#guideBtn', kind: 'nav' },

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
