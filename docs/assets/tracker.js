'use strict';
// Lottery & timed-release tracker — the "lose-by-minutes" drops that sell out the
// instant they open. Combines fixed recurring JST rules with the dated booking
// windows mined from the research (bookByTimeline).

import { $, esc } from './lib/dom.js';
import { fmtShort } from './lib/dates.js';
import { gcalUrl } from './lib/ics.js';

// Recurring fixed-time drops (no single date — a standing rule). Verify closer.
const DROPS = [
  { title: 'Ghibli Museum (Mitaka) tickets', when: '10th of each month · 10:00 JST', detail: 'Next month’s dated/timed tickets go on sale via Lawson. Sell out in minutes — be logged in and ready at 10:00 sharp.', url: 'https://www.ghibli-museum.jp/en/tickets/' },
  { title: 'Ghibli Park tickets', when: '10th of each month · 14:00 JST', detail: 'Two months ahead via Boo-Woo/Lawson. Dated + timed entry; the Grand Warehouse area is the bottleneck.', url: 'https://ghibli-park.jp/en/' },
  { title: 'Tokyo Disney date-tickets', when: 'Daily · rolling 60 days ahead (~14:00 JST)', detail: 'Date-specific park tickets release on a 60-day rolling window. Hotel/Vacation-Package guests get earlier access; NYE & big seasonals are separate lotteries.', url: 'https://www.tokyodisneyresort.jp/en/' },
  { title: 'Grand Sumo tickets', when: '~1 month before each basho (on-sale date varies)', detail: 'Ticket Pia / Oosumo advance lottery then general sale. Tokyo basho: Jan, May, Sep at Ryogoku Kokugikan.', url: 'https://sumo.pia.jp/en/' },
];

export function mountTracker(data) {
  const wrap = $('#trackerList');
  if (!wrap) return;
  const dated = (data.bookByTimeline || [])
    .filter(b => /(lottery|timed|release|on-sale|on sale|jst|10:00|14:00|sells? out|advance ticket|wristband)/i.test((b.what || '') + (b.action || '')))
    .sort((a, b) => (a.when || '9999').localeCompare(b.when || '9999'));

  const recurring = DROPS.map(d => `
    <div class="trk-card recurring">
      <div class="trk-when">${esc(d.when)}</div>
      <div class="trk-title">${esc(d.title)}</div>
      <div class="trk-detail">${esc(d.detail)}</div>
      <a class="trk-link" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">official ↗</a>
    </div>`).join('');

  const datedHTML = dated.map(b => {
    const ev = { title: b.what, date: (b.when && /^\d{4}-\d{2}-\d{2}$/.test(b.when)) ? b.when : '', note: b.action };
    const add = ev.date ? `<a class="trk-link" href="${esc(gcalUrl(ev))}" target="_blank" rel="noopener noreferrer">+ reminder</a>` : '';
    return `<div class="trk-card">
      <div class="trk-when">${b.when && /^\d{4}-\d{2}-\d{2}$/.test(b.when) ? esc(fmtShort(b.when)) : esc(b.when || 'TBD')}${b.leadTime ? ` · ${esc(b.leadTime)}` : ''}</div>
      <div class="trk-title">${esc(b.what)}</div>
      <div class="trk-detail">${esc(b.action)}</div>${add}</div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="trk-group"><h3 class="trk-h">Fixed timed-release rules</h3><div class="trk-grid">${recurring}</div></div>
    ${dated.length ? `<div class="trk-group"><h3 class="trk-h">Dated booking windows</h3><div class="trk-grid">${datedHTML}</div></div>` : ''}`;
}
