'use strict';
// Single source of truth for the dashboard "home layout" themes. These are LAYOUT variants
// of the SAME dashboard DOM (selected via html[data-home="…"]), not separate pages — so the
// content is identical across all three and can never drift. Pure + import-safe (no DOM/store),
// so the parity test can assert every layout here has matching CSS + a settings control.

export const HOME_LAYOUTS = ['kakemono', 'engawa', 'bento'];
export const DEFAULT_HOME_LAYOUT = 'kakemono';

// human label for the Settings segmented control (keyed by layout id)
export const HOME_LAYOUT_LABELS = { kakemono: 'Scroll', engawa: 'Split', bento: 'Bento' };

// coerce any stored/unknown value to a valid layout (guards a corrupted localStorage value)
export function normalizeHomeLayout(v) {
  return HOME_LAYOUTS.includes(v) ? v : DEFAULT_HOME_LAYOUT;
}
