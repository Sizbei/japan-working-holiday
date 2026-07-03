// jwh-notion-budget — a tiny CORS proxy so the static dashboard can read the owner's Notion
// budget database. The Notion token NEVER reaches the browser: it lives here as a Worker
// secret. GET ?k=<PAGE_KEY> → simplified rows as JSON (10-min edge cache).
//
// Secrets (wrangler secret put …): NOTION_TOKEN, NOTION_DB (database id), PAGE_KEY (a shared
// key the page sends — same obscurity model as the site's gate; the data is a personal budget,
// not credentials).

const ALLOWED = ['https://sizbei.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];

function cors(origin) {
  const ok = ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return { 'Access-Control-Allow-Origin': ok, 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET' };
}

// Notion property → plain value (title/rich_text → string, number, select/status → name, checkbox)
function plain(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case 'title': return (prop.title || []).map(t => t.plain_text).join('');
    case 'rich_text': return (prop.rich_text || []).map(t => t.plain_text).join('');
    case 'number': return prop.number;
    case 'select': return prop.select ? prop.select.name : null;
    case 'status': return prop.status ? prop.status.name : null;
    case 'checkbox': return prop.checkbox;
    case 'date': return prop.date ? prop.date.start : null;
    case 'formula': return prop.formula ? (prop.formula.number ?? prop.formula.string ?? null) : null;
    default: return null;
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const headers = { ...cors(req.headers.get('Origin') || ''), 'Content-Type': 'application/json' };
    if (req.method !== 'GET') return new Response('{"error":"GET only"}', { status: 405, headers });
    if (!env.NOTION_TOKEN || !env.NOTION_DB || !env.PAGE_KEY) {
      return new Response('{"error":"not configured"}', { status: 503, headers });
    }
    if (url.searchParams.get('k') !== env.PAGE_KEY) {
      return new Response('{"error":"forbidden"}', { status: 403, headers });
    }
    const rows = [];
    let cursor = undefined;
    for (let page = 0; page < 5; page++) {   // up to 500 rows — plenty for a budget
      const r = await fetch(`https://api.notion.com/v1/databases/${env.NOTION_DB}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 }),
      });
      if (!r.ok) return new Response(JSON.stringify({ error: 'notion ' + r.status }), { status: 502, headers });
      const j = await r.json();
      (j.results || []).forEach(pg => {
        const out = {};
        Object.entries(pg.properties || {}).forEach(([k, v]) => { const p = plain(v); if (p !== null && p !== '') out[k] = p; });
        rows.push(out);
      });
      if (!j.has_more) break;
      cursor = j.next_cursor;
    }
    return new Response(JSON.stringify({ at: Date.now(), rows }), {
      headers: { ...headers, 'Cache-Control': 'public, max-age=600' },   // 10-min edge cache
    });
  },
};
