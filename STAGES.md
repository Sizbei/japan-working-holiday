# Planned Stages — queued work

Live site deploys from `main`/`docs`. Each stage ships independently, tested + subagent-reviewed, then pushed.

---

## Stage A — Rearrange ANY event (incl. researched/baked)
**Why:** "calendar DnD doesn't work" = baked/researched events are read-only, so dragging them does nothing. Only your own added events move today.
**Plan:**
- Add a `jwh-event-overrides-v1` map `{ bakedEventId → newDate }`. `allEvents()` applies the override when rendering a baked event (so its chip shows on the new day) without mutating `tips.json`.
- Make baked chips draggable too (`makeMovable` `canDrag` → always true); on drop, write/update the override (user events keep using `jwh-events-v1` as now).
- A small "reset to original date" affordance in the baked-event detail popover.
- Keyboard parity (arrow-move) + reduced-motion safe. Verify: drag a researched event to a new day → persists + survives reload; reset restores it.

## Stage B — Swipe-to-dismiss notifications (+ done: click-to-navigate ✅)
**Done already:** clicking a notification routes to its view (deadline/book → Deadlines, task → Checklist, event → Calendar) and closes the panel.
**Plan (swipe):**
- Pointer-based horizontal swipe on `.np-item` (reuse the `dnd.js` pointer model): drag left/right past a threshold → animate out → add id to `jwh-notif-dismissed-v1` + refresh. Snap-back if under threshold.
- Keyboard/desktop fallback: the existing ✕ stays. Respect reduced-motion (instant). Verify: swipe dismisses + persists; ✕ still works.

## Stage C — Filters for events + Discover
**Calendar/events:** the month grid already filters by category (legend). Add the same category + a **search** + **"has booking deadline"** toggle to the **Agenda** view (currently unfiltered), and a quick "next 30/90 days / this season" range filter.
**Discover (Explore):** add a unified filter bar to the pillar grids — by **interest** (music/games/building/meetups/food/disney/activities), **area** (Shibuya/Akihabara/Shinjuku/…), and **budget tier** (budget/mid/splurge), plus the existing search. One reusable `filterBar(items, facets)` helper; chips persist per-session. Verify: toggling a facet filters cards live; counts update.

## Stage D — Share-room finder page (`#/rooms`)
**Goal:** browse + compare Tokyo share houses with contacts, address, links, requirements, filters, cost, and move-in date.

**API reality (researched):** the major providers — **Oakhouse, Sakura House, Borderless House, Social Apartments (Global Agents), GaijinPot Housing, Hituji Real Estate, Tokyo Sharehouse, Comingle** — have **no documented public API / API keys**. So the honest options:
- **D1 (now, zero-build):** a **curated dataset** baked into `tips.json` (`rooms[]`) — the best foreigner-friendly providers + representative houses, with all the requested fields. Filterable/sortable client-side. Ships immediately, no backend, no ToS risk.
- **D2 (the "create your own API" path):** a **Cloudflare Worker** (you already use Cloudflare) that fetches the providers' listing pages on a schedule, parses them into a normalized JSON feed (cached in KV/R2), and serves it to the static site via one `fetch`. This is the real "own API." Respect each site's robots.txt/ToS; start with providers that expose structured listings (Tokyo Sharehouse, Hituji aggregate many houses). Secrets/keys live in Worker env, never in the static repo.
- **Recommended:** ship **D1** first (instant value), then add **D2** as a follow-up so the page shows live availability.

**Page spec (`#/rooms`):**
- **Card per house:** name · provider · area + nearest station · **monthly cost** (rent + utilities/maintenance + one-time contract fee, "no key money?" flag) · **move-in / availability date** · **requirements** (visa OK, guarantor needed?, deposit, min stay) · room type (private/dorm) · **contact** (inquiry email/phone) · **links** (listing + provider) · short note.
- **Filters/sort:** area (multi), **max budget** (slider), **move-in by** (date), no-key-money, foreigner-friendly, private-vs-dorm, gender policy. Sort by cost / move-in date.
- **Data model:** `rooms[]` with `{id,name,provider,area,station,rentJPY,feesJPY,oneTimeJPY,noKeyMoney,moveIn,requirements[],roomType,gender,contact,listingUrl,providerUrl,note,sources[],confidence}`.
- Reuses the SPA shell, card system, and `filterBar` from Stage C. Add `#/rooms` to the router + nav.

## Stage E — Tokyo music events (research in flight)
A 6-lane research workflow (clubs, live houses, jazz/listening, festivals, record fairs, synth/modular) is running. On completion: bake `musicEvents[]` (recurring venues/nights) + add dated 2026–27 festivals to the calendar (category `music`), surfaced in Explore + the MY TOKYO band. Adversarial sign-off flags closed venues (Contact, SuperDeluxe) + over-confident dates before baking.

---

### Suggested order
C (filters — fast, high-use) → A (rearrange events — fixes the DnD frustration) → B (swipe dismiss) → E (bake music when ready) → D1 (rooms curated) → D2 (rooms live Worker).
