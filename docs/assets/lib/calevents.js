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

export function eventMenuSpec(ev, { isGoing = false } = {}) {
  const going = { key: 'going', label: isGoing ? '✓ Going' : '＋ Going' };
  if (ev.source === 'user') {
    return [
      { key: 'edit', label: 'Edit' },
      { key: 'duplicate', label: 'Duplicate' },
      { key: 'plan', label: '＋ Add to day plan' },
      { key: 'gcal', label: '＋ Google Calendar' },
      going,
      { sep: true },
      { key: 'delete', label: 'Delete', danger: true },
    ];
  }
  return [
    { key: 'open', label: 'Open details' },
    { key: 'plan', label: '＋ Add to day plan' },
    { key: 'gcal', label: '＋ Google Calendar' },
    { key: 'copy', label: 'Copy to my events' },
    going,
  ];
}
