# Japan Working Holiday — Insider Living Hacks (Canada → Tokyo)

A personal relocation guide and static website covering **non-obvious, money-saving hacks for living in Japan on a Canadian Working Holiday Visa**, tailored to an NRT arrival on **June 30, 2026**.

The content is produced by a multi-stage deep-research pipeline (plan → adversarial review → two research waves → fact-checking → ranking → tailoring → synthesis) and presented as a clean, searchable single-page site.

## 🌐 The site

Lives in [`docs/`](docs/) so it can be served by **GitHub Pages** (Settings → Pages → Source: `main` / `/docs`).

- `docs/index.html` — the page
- `docs/assets/style.css` — Japan-accent design (hinomaru red / ai-iro indigo / washi paper), dark mode
- `docs/assets/app.js` — renders from data, search + confidence filter
- `docs/data/tips.json` — **the single source of truth.** All content is here; the page renders it.

### Run locally

The page fetches `tips.json`, so open it over HTTP (not `file://`):

```bash
cd docs
python3 -m http.server 8000
# then visit http://localhost:8000
```

## ✏️ Updating content

Edit `docs/data/tips.json` — the site re-renders automatically. Structure:

| Key | What it drives |
|-----|----------------|
| `meta` | Title, subtitle, status banner, arrival date |
| `timeSensitive[]` | The ⏰ deadline table |
| `canadaNotes[]` | 🇨🇦 Canada-specific notes |
| `arrivalSequence[]` | 🗓️ ordered arrival-week steps |
| `top10[]` | 🏆 highest-value moves |
| `domains[].findings[]` | The main tip cards (with `confidence`: high/medium/low) |
| `sources[]` | 📚 consolidated source links |

## ⚠️ Disclaimer

Visa, tax, pension, and immigration rules change. **Always verify against official consulate / government sources** before relying on anything here. This is a personal aid, not professional advice.
