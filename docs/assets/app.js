'use strict';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let DATA = null;
let activeConf = 'all';
let query = '';

// ---- Theme ----
(function initTheme() {
  const saved = localStorage.getItem('jwh-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  updateToggle(theme);
})();
function updateToggle(theme) { const b = $('#themeToggle'); if (b) b.textContent = theme === 'dark' ? '☀️' : '🌙'; }
$('#themeToggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('jwh-theme', next);
  updateToggle(next);
});

// ---- Load ----
fetch('data/tips.json', { cache: 'no-store' })
  .then(r => { if (!r.ok) throw new Error('Failed to load tips.json'); return r.json(); })
  .then(data => { DATA = data; render(); })
  .catch(err => {
    $('#domains').innerHTML = `<div class="empty">Could not load data (${esc(err.message)}). If viewing locally, serve over HTTP (e.g. <code>python3 -m http.server</code>).</div>`;
  });

function render() {
  const m = DATA.meta || {};
  $('#heroTitle').textContent = 'Japan Working Holiday';
  $('#heroSub').textContent = m.subtitle || 'Insider living hacks · Canada → Tokyo';
  $('#heroStatus').textContent = m.status || '';
  $('#metaArrival').textContent = m.arrival_date ? `Arrival: ${m.arrival_date}` : '';
  $('#metaGenerated').textContent = m.generated ? `Updated ${m.generated}` : '';
  $('#footGen').textContent = m.generated || '';

  renderTimeSensitive();
  renderCanada();
  renderSequence();
  renderTop();
  renderSources();
  renderDomains();
  buildTOC();
  wireControls();
}

function renderTimeSensitive() {
  const tb = $('#timeTable tbody');
  const rows = DATA.timeSensitive || [];
  if (!rows.length) { $('#timeSensitiveSection').style.display = 'none'; return; }
  tb.innerHTML = rows.map(r => `
    <tr>
      <td>${esc(r.item)}</td>
      <td>${esc(r.timing)}</td>
      <td>${esc(r.action)}</td>
    </tr>`).join('');
}

function renderCanada() {
  const list = DATA.canadaNotes || [];
  if (!list.length) { $('#canadaSection').style.display = 'none'; return; }
  $('#canadaList').innerHTML = list.map(n => `<li>${esc(n)}</li>`).join('');
}

function renderSequence() {
  const list = DATA.arrivalSequence || [];
  if (!list.length) { $('#sequenceSection').style.display = 'none'; return; }
  $('#sequenceList').innerHTML = list.map(s => `<li>${esc(s)}</li>`).join('');
}

function renderTop() {
  const list = DATA.top10 || [];
  if (!list.length) { $('#topSection').style.display = 'none'; return; }
  $('#topGrid').innerHTML = list.map(t => `
    <div class="top-card">
      <div class="t-tip">${esc(t.tip)}</div>
      <div class="t-reason">${esc(t.reason)}</div>
      <div class="t-domain">${esc(t.domain || '')}</div>
    </div>`).join('');
}

function renderSources() {
  const list = DATA.sources || [];
  if (!list.length) { $('#sourcesSection').style.display = 'none'; return; }
  $('#sourcesList').innerHTML = list.map(u => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a></li>`).join('');
}

function matches(f) {
  if (activeConf !== 'all' && (f.confidence || '').toLowerCase() !== activeConf) return false;
  if (!query) return true;
  const hay = `${f.tip} ${f.why} ${f.how} ${f.impact}`.toLowerCase();
  return hay.includes(query);
}

function renderDomains() {
  const wrap = $('#domains');
  const domains = DATA.domains || [];
  let any = false;
  wrap.innerHTML = domains.map(d => {
    const found = (d.findings || []).filter(matches);
    if (!found.length) return '';
    any = true;
    return `
      <section class="domain" id="d-${esc(d.key)}">
        <h3 class="domain-head"><span class="d-icon">${esc(d.icon || '•')}</span>${esc(d.title)}</h3>
        ${found.map(f => findingHTML(f)).join('')}
      </section>`;
  }).join('');
  if (!any) wrap.innerHTML = `<div class="empty">No tips match your search/filter.</div>`;
}

function findingHTML(f) {
  const conf = (f.confidence || 'medium').toLowerCase();
  const srcs = (f.sources || []).filter(Boolean);
  return `
    <div class="finding">
      <div class="finding-top">
        <p class="f-tip">${esc(f.tip)}</p>
        <span class="badge ${conf}">${esc(conf)}</span>
      </div>
      ${f.why ? `<p class="f-why">${esc(f.why)}</p>` : ''}
      ${f.how ? `<p class="f-how"><b>How:</b> ${esc(f.how)}</p>` : ''}
      ${f.impact ? `<p class="f-impact"><b>Impact:</b> ${esc(f.impact)}</p>` : ''}
      ${srcs.length ? `<div class="f-sources">${srcs.map(s => `<a href="${esc(s)}" target="_blank" rel="noopener">source ↗</a>`).join('')}</div>` : ''}
    </div>`;
}

function buildTOC() {
  const items = [
    ['timeSensitiveSection', '⏰ Time-Sensitive'],
    ['canadaSection', '🇨🇦 Canada'],
    ['sequenceSection', '🗓️ Sequence'],
    ['topSection', '🏆 Top Moves'],
    ...(DATA.domains || []).map(d => [`d-${d.key}`, `${d.icon || ''} ${d.title}`]),
    ['sourcesSection', '📚 Sources'],
  ];
  $('#toc').innerHTML = items
    .filter(([id]) => { const el = document.getElementById(id); return el && el.style.display !== 'none'; })
    .map(([id, label]) => `<a href="#${id}">${esc(label)}</a>`).join('');
}

function wireControls() {
  $('#search').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); renderDomains(); });
  $$('#confFilters .chip').forEach(chip => chip.addEventListener('click', () => {
    $$('#confFilters .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeConf = chip.dataset.conf;
    renderDomains();
  }));
}
