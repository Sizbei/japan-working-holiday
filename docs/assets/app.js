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
function updateToggle(theme) {
  const b = $('#themeToggle');
  if (!b) return;
  const isDark = theme === 'dark';
  const icon = b.querySelector('span') || b;
  icon.textContent = isDark ? '☀️' : '🌙';
  b.setAttribute('aria-pressed', String(isDark));
  b.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
}
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
  initBrew();
  renderChecklist();
  renderActivities();
  renderRestaurants();
  renderDisney();
  renderGrid('building', '#buildingGrid', 'Scouting coworking spots &amp; work cafés…');
  renderGrid('music', '#musicGrid', 'Digging through the music scene…');
  renderGrid('geek', '#geekGrid', 'Mapping arcades, anime spots &amp; tech…');
  renderGrid('meetups', '#meetupsGrid', 'Finding meetups &amp; conventions…');
  buildTOC();
  wireControls();
  wireTierFilter();
}

// ---- helpers for v2 content cards ----
function metaPills(item) {
  const out = [];
  if (item.area_or_park) out.push(`<span class="pill area">${esc(item.area_or_park)}</span>`);
  if (item.month_or_season) out.push(`<span class="pill when">${esc(item.month_or_season)}</span>`);
  if (item.price_or_cost) out.push(`<span class="pill price">${esc(item.price_or_cost)}</span>`);
  return out.join('');
}
function srcLinks(item) {
  const s = (item.sources || []).filter(Boolean);
  if (!s.length) return '';
  return `<div class="c-src">${s.slice(0, 3).map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">source ${i + 1} ↗</a>`).join('')}</div>`;
}
function contentCard(item) {
  const tier = (item.tier || 'n/a').toLowerCase();
  return `
    <article class="card2 tier-${esc(tier)}" data-tier="${esc(tier)}">
      <div class="c-name">${esc(item.name)}</div>
      ${item.detail ? `<div class="c-detail">${esc(item.detail)}</div>` : ''}
      ${item.how_or_when ? `<div class="c-detail"><b>↳</b> ${esc(item.how_or_when)}</div>` : ''}
      <div class="c-meta">${metaPills(item)}</div>
      ${srcLinks(item)}
    </article>`;
}

function renderActivities() {
  const list = DATA.activities || [];
  const grid = $('#activitiesGrid');
  if (!list.length) { grid.innerHTML = `<div class="empty">Researching the seasonal calendar… this fills in automatically.</div>`; return; }
  grid.innerHTML = list.map(contentCard).join('');
}

function renderRestaurants() {
  const list = DATA.restaurants || [];
  const grid = $('#restaurantsGrid');
  if (!list.length) { grid.innerHTML = `<div class="empty">Hunting down the best eats… this fills in automatically.</div>`; return; }
  grid.innerHTML = list.map(contentCard).join('');
}

function renderDisney() {
  const list = DATA.disney || [];
  const grid = $('#disneyGrid');
  if (!list.length) { grid.innerHTML = `<div class="empty">Mapping out Disneyland &amp; DisneySea… this fills in automatically.</div>`; return; }
  grid.innerHTML = list.map(contentCard).join('');
}

// generic pillar grid (building / music / geek / meetups) keyed by DATA[key]
function renderGrid(key, sel, placeholder) {
  const list = DATA[key] || [];
  const grid = $(sel);
  if (!grid) return;
  if (!list.length) { grid.innerHTML = `<div class="empty">${placeholder} this fills in automatically.</div>`; return; }
  grid.innerHTML = list.map(contentCard).join('');
}

// ---- Brainstorm & Brew (autosaving scratchpad + idea cards) ----
const BREW_NOTES_KEY = 'jwh-brew-notes-v1';
const BREW_IDEAS_KEY = 'jwh-brew-ideas-v1';
function loadIdeas() { try { return JSON.parse(localStorage.getItem(BREW_IDEAS_KEY)) || []; } catch { return []; } }
function saveIdeas(arr) { try { localStorage.setItem(BREW_IDEAS_KEY, JSON.stringify(arr)); } catch {} }

function initBrew() {
  const pad = $('#brewNotes');
  const saved = $('#brewSaved');
  if (pad) {
    pad.value = localStorage.getItem(BREW_NOTES_KEY) || '';
    let t;
    pad.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        try { localStorage.setItem(BREW_NOTES_KEY, pad.value); } catch {}
        if (saved) { saved.classList.add('show'); setTimeout(() => saved.classList.remove('show'), 1200); }
      }, 350);
    });
  }
  const form = $('#brewForm');
  const input = $('#brewInput');
  if (form && input) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = input.value.trim();
      if (!val) return;
      const ideas = loadIdeas();
      ideas.unshift({ id: 'i' + Date.now(), text: val });
      saveIdeas(ideas);
      input.value = '';
      renderIdeas();
    });
  }
  renderIdeas();
}

function renderIdeas() {
  const list = $('#brewList');
  if (!list) return;
  const ideas = loadIdeas();
  if (!ideas.length) { list.innerHTML = `<li class="brew-empty">No idea cards yet — add one above.</li>`; return; }
  list.innerHTML = ideas.map(i => `
    <li class="brew-card">
      <span>${esc(i.text)}</span>
      <button type="button" data-del="${esc(i.id)}" aria-label="Delete idea">✕</button>
    </li>`).join('');
  list.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', () => {
    saveIdeas(loadIdeas().filter(x => x.id !== b.dataset.del));
    renderIdeas();
  }));
}

// ---- saveable yearlong checklist ----
const CHECK_KEY = 'jwh-checklist-v1';
function loadChecks() { try { return JSON.parse(localStorage.getItem(CHECK_KEY)) || {}; } catch { return {}; } }
function saveChecks(state) { try { localStorage.setItem(CHECK_KEY, JSON.stringify(state)); } catch {} }

function renderChecklist() {
  const phases = DATA.checklist || [];
  const wrap = $('#checkPhases');
  if (!phases.length) { wrap.innerHTML = `<div class="empty">Building the yearlong plan… this fills in automatically.</div>`; return; }
  const state = loadChecks();
  wrap.innerHTML = phases.map((p, pi) => `
    <div class="phase-block">
      <h3>${esc(p.phase)} <span class="window">${esc(p.window || '')}</span></h3>
      <ul class="check-list">
        ${(p.items || []).map((it, ii) => {
          const id = `c-${pi}-${ii}`;
          const checked = state[id] ? 'checked' : '';
          const kind = (it.kind || 'experience').toLowerCase();
          return `
          <li class="check-item">
            <input type="checkbox" id="${id}" data-cid="${id}" ${checked} aria-label="${esc(it.task)}">
            <label class="ci-body" for="${id}">
              <span class="ci-task">${esc(it.task)}<span class="kind-tag kind-${esc(kind)}">${esc(kind)}</span></span>
              ${it.note ? `<span class="ci-note">${esc(it.note)}</span>` : ''}
            </label>
          </li>`;
        }).join('')}
      </ul>
    </div>`).join('');
  $('#checkProgress').hidden = false;
  wireChecklist();
  updateProgress();
}

function wireChecklist() {
  $$('#checkPhases input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const state = loadChecks();
      if (cb.checked) state[cb.dataset.cid] = true; else delete state[cb.dataset.cid];
      saveChecks(state);
      updateProgress();
    });
  });
  const reset = $('#checkReset');
  if (reset) reset.addEventListener('click', () => {
    if (!confirm('Reset all checkmarks?')) return;
    saveChecks({});
    $$('#checkPhases input[type=checkbox]').forEach(cb => { cb.checked = false; });
    updateProgress();
  });
}

function updateProgress() {
  const boxes = $$('#checkPhases input[type=checkbox]');
  if (!boxes.length) return;
  const done = boxes.filter(b => b.checked).length;
  const pct = Math.round((done / boxes.length) * 100);
  $('#checkBar').style.width = pct + '%';
  $('#checkPct').textContent = `${pct}% · ${done}/${boxes.length}`;
}

function wireTierFilter() {
  $$('#tierFilters .chip').forEach(chip => chip.addEventListener('click', () => {
    $$('#tierFilters .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const t = chip.dataset.tier;
    $$('#restaurantsGrid .card2').forEach(card => {
      card.style.display = (t === 'all' || card.dataset.tier === t) ? '' : 'none';
    });
  }));
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
    ['brew', '💭 Brainstorm & Brew'],
    ['checklist', '✅ Yearlong Checklist'],
    ['activities', '🌸 Things I\'ll Do'],
    ['restaurants', '🍜 Restaurants'],
    ['disney', '🏰 Tokyo Disney'],
    ['building', '💻 Building From Tokyo'],
    ['music', '🎛️ Music & Gear'],
    ['geek', '🎮 Games & Anime'],
    ['meetups', '🤝 Meetups & Cons'],
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
