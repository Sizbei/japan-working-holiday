'use strict';
// Pure helpers for the calendar event context menu (testable in Node, no DOM):
//  - duplicateUserEvent: build a copy of a user event with a caller-supplied id.
//  - eventMenuSpec: the ordered menu item list for an event, as plain data (no callbacks).
//    `key` is an action id that calendar.js maps to a handler. Baked events get a read-only set.

export function duplicateUserEvent(ev, newId) {
  return {
    id: newId,
    title: ev.title,
    date: ev.date,
    endDate: ev.endDate || '',
    category: ev.category || 'personal',
    note: ev.note || '',
    area: ev.area || '',
    copyOf: ev.id,
  };
}

export function eventMenuSpec(ev, { alreadyPlanned = false } = {}) {
  const plan = alreadyPlanned ? null : { key: 'plan', label: '＋ Add to day plan' };
  if (ev.source === 'user') {
    return [
      { key: 'edit', label: 'Edit' },
      { key: 'duplicate', label: 'Duplicate' },
      plan,
      { key: 'checklist', label: '＋ Add to checklist' },
      { key: 'gcal', label: '＋ Google Calendar' },
      { sep: true },
      { key: 'delete', label: 'Delete', danger: true },
    ].filter(Boolean);
  }
  return [
    { key: 'open', label: 'Open details' },
    plan,
    { key: 'checklist', label: '＋ Add to checklist' },
    { key: 'gcal', label: '＋ Google Calendar' },
    { key: 'copy', label: 'Copy to my events' },
  ].filter(Boolean);
}
