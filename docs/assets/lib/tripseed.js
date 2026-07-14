'use strict';
// Baked Plan-a-Day itineraries for the whole pre-move trip (Jul 13–26, 2026), seeded ONCE at boot
// (guarded by KEYS.seedPlanTrip in main.js). Non-destructive: a day is only added if the user has
// none for that date, so hand-edited days are never clobbered. Same stop shape as lib/dayplan.js
// newStop(): { id, placeId, name, lat, lng, coordKind, area, startTime, durationMin, note, locked }.

const stop = (id, name, area, startTime, durationMin, note, lat, lng) => ({
  id, placeId: '', name, lat: lat ?? null, lng: lng ?? null,
  coordKind: 'approx', area, startTime, durationMin, note, locked: false,
});

export const TRIP_DAYPLANS = {
  '2026-07-13': { date: '2026-07-13', title: 'Eye clinic + last Tokyo bits (Kamakura → tomorrow)', note: 'Swapped with the 14th so Kamakura gets a full day tomorrow. Today is built around the eye-clinic exam — call ahead, and keep tonight low-key since the exam dilates your pupils.', stops: [
    stop('p0713a', '🍜 Lunch: Motenashi Kuroki', 'Asakusabashi', '11:45', 60, 'Lunch run 11:30–14:30 (their dinner run works too if you miss it); ticket machine, ~¥1,100–1,500', 35.6987, 139.7855),
    stop('p0713b', '👁 Eye clinic — Shinagawa LASIK, Yurakucho', 'Yurakucho (ITOCiA 13F)', '13:30', 210, 'You wear glasses (no contacts) → no waiting period, so today can be the FULL measurement exam. Call first: 0120-412-049 (EN 080-8867-4964, to 20:00). ~3–4h; dilates pupils → blurry 4–6h, keep tonight low-key. Goal: get measured → book surgery for after Hokkaido (~Jul 27). Then grab correct same-day glasses at a nearby JINS/Zoff for the trip.', 35.6744, 139.7633),
    stop('p0713c', 'Akihabara — Comiket wristband (if time)', 'Akihabara', '17:30', 90, 'Only if the exam didn\'t run long / your eyes aren\'t dilated. Grab the C108 afternoon-advance wristband at Animate/Melonbooks (¥440)', 35.6984, 139.7731),
    stop('p0713d', 'Pack for Hokkaido + low-key evening', 'Asakusabashi', '19:30', 120, 'Dilation blurs vision for hours — skip the fancy dinner tonight. Pack: rain shell + warm layer + hiking shoes for Asahidake; withdraw cash', 35.6987, 139.7855),
    stop('p0713e', 'Mitama Matsuri — 30,000 lanterns at Yasukuni (optional)', 'Kudanshita / Yasukuni Shrine', '19:30', 90, 'Big evening lantern festival, ~10 min from Asakusabashi. OPTIONAL — skip if your eyes are still dilated/light-sensitive from the exam.', 35.6939, 139.7436),
  ]},
  '2026-07-14': { date: '2026-07-14', title: 'Light pre-flight day → Mitama Matsuri lanterns', note: 'Kamakura moved to after Hokkaido (see Jul 28). Keep today easy — you fly to Sapporo tomorrow at 15:10. Pack + cash today, lanterns tonight.', stops: [
    stop('p0714a', 'Easy morning + errands', 'Asakusabashi / Kuramae', '10:30', 150, 'Last relaxed Tokyo morning; if you got your Rx yesterday, grab correct same-day glasses at a JINS/Zoff', 35.6987, 139.7855),
    stop('p0714b', 'Pack for Hokkaido + withdraw cash', 'Asakusabashi', '14:00', 120, 'Rain shell + warm layer + hiking shoes for Asahidake; 7-Bank ATM for the rural legs', 35.6987, 139.7855),
    stop('p0714c', '🏮 Mitama Matsuri — Yasukuni lanterns', 'Kudanshita / Yasukuni Shrine', '19:00', 120, '30,000 lanterns, food stalls, bon-odori. ~15–20 min from Asakusabashi; lit dusk–~21:30 (festival runs Jul 13–16)', 35.6939, 139.7436),
  ]},
  '2026-07-15': { date: '2026-07-15', title: 'Fly to Sapporo (easy morning)', note: 'MM573 (Peach, LCC) NRT 15:10 — bag-drop closes ~50 min prior. Little Japan checkout in the morning.', stops: [
    stop('p0715a', 'Kuramae coffee + last Sumida stroll', 'Kuramae', '09:30', 75, 'Say bye to the neighborhood', 35.7030, 139.7905),
    stop('p0715b', 'Little Japan checkout + bags', 'Asakusabashi', '11:30', 30, '', 35.6987, 139.7855),
    stop('p0715c', 'Asakusa line Access Express → NRT', 'Asakusabashi → Narita T1', '12:15', 75, 'Direct ~75 min; be at NRT by ~13:30', 35.7646, 140.3863),
    stop('p0715d', 'CTS → Sapporo Guest House Nariya', 'Sapporo (Toyohira)', '17:30', 60, 'Rapid Airport to Sapporo Stn; in from 16:00', 43.0455, 141.3567),
    stop('p0715e', 'Susukino soup curry dinner', 'Susukino', '19:30', 75, 'Suage+ or Garaku — queue moves fast', 43.0555, 141.3535),
  ]},
  '2026-07-16': { date: '2026-07-16', title: 'Sapporo city day', note: '', stops: [
    stop('p0716a', 'Nijo Market breakfast', 'Sapporo', '08:30', 60, 'Kaisen-don + melon', 43.0570, 141.3594),
    stop('p0716b', 'Odori Park + TV Tower', 'Sapporo', '10:00', 60, '', 43.0609, 141.3466),
    stop('p0716c', 'Sapporo Beer Museum', 'Sapporo (Higashi)', '11:30', 90, 'Free museum; tasting set ~¥1,000', 43.0722, 141.3679),
    stop('p0716d', 'Tanukikoji / downtown wander', 'Sapporo', '14:00', 120, 'Arcade street, coffee, souvenirs', 43.0565, 141.3510),
    stop('p0716e', 'Mt. Moiwa ropeway — night view', 'Sapporo (Moiwa)', '18:30', 120, 'Top-3 night view in Japan; go at dusk', 43.0290, 141.3213),
    stop('p0716f', 'Ganso Ramen Yokocho — miso ramen', 'Susukino', '21:00', 45, '', 43.0543, 141.3532),
  ]},
  '2026-07-17': { date: '2026-07-17', title: 'Otaru day trip', note: 'JR Rapid Airport ~35 min. Sit left (sea side) outbound.', stops: [
    stop('p0717a', 'Sankaku Market — sushi/uni breakfast', 'Otaru', '09:30', 60, 'By the station; uni in season', 43.1966, 140.9945),
    stop('p0717b', 'Otaru Canal walk', 'Otaru', '11:00', 60, '', 43.1984, 141.0023),
    stop('p0717c', 'Sakaimachi Street — glass + music boxes', 'Otaru', '12:30', 120, 'Kitaichi Glass, Music Box Museum, LeTAO double fromage', 43.1924, 141.0052),
    stop('p0717d', 'Tenguyama ropeway OR early return', 'Otaru', '15:00', 120, 'Bay view; skip if tired', 43.1795, 140.9855),
    stop('p0717e', 'Back to Sapporo — jingisukan dinner', 'Sapporo', '19:00', 90, 'Daruma honten (queue) or Beer Garden hall', 43.0554, 141.3540),
  ]},
  '2026-07-18': { date: '2026-07-18', title: 'Bonus Sapporo Saturday → Susukino manga cafe', note: 'Nariya checkout 11:00 — stash bags in a Sapporo Stn coin locker. No bed booked: crashing at Kaikatsu Club Susukino tonight (walk-in).', stops: [
    stop('p0718a', 'Nariya checkout + bags to coin locker', 'Sapporo Stn', '10:30', 45, 'JR Sapporo lockers; keep a small day-bag', 43.0687, 141.3508),
    stop('p0718b', 'Moerenuma Park (Isamu Noguchi)', 'Sapporo (Higashi)', '11:30', 180, 'Rent a bike inside; Glass Pyramid + Mt. Moere', 43.1222, 141.4273),
    stop('p0718c', 'Late lunch + Tanukikoji wander', 'Sapporo (Chuo)', '15:00', 120, 'Arcade street, last souvenir run', 43.0565, 141.3510),
    stop('p0718d', 'Sapporo Beer Garden or café break', 'Sapporo', '17:30', 90, 'Or just rest — big days ahead', 43.0722, 141.3679),
    stop('p0718e', 'Susukino Saturday night + shime parfait', 'Susukino', '19:30', 150, 'Dinner, then the Sapporo nightcap', 43.0555, 141.3535),
    stop('p0718f', 'Grab bags, check into Kaikatsu Club Susukino', 'Susukino', '22:00', 30, 'Night pack from 20:00, ~¥1,800 booth; showers. 1 min from Susukino Stn exit 5. Backup: DiCE Tanukikoji', 43.0548, 141.3536),
  ]},
  '2026-07-19': { date: '2026-07-19', title: 'Sapporo → Furano — lavender peak', note: 'Manga-cafe checkout early. Reserve the Furano/Lavender Express (seasonal weekend direct, ~2h) — it fills.', stops: [
    stop('p0719a', 'Checkout + breakfast + retrieve bags', 'Sapporo', '07:30', 45, '', 43.0687, 141.3508),
    stop('p0719b', 'Furano/Lavender Express → Furano', 'JR', '08:15', 135, 'Direct seasonal train; else Ltd Exp to Asahikawa + Furano Line', 43.3420, 142.3830),
    stop('p0719c', 'Bags to Mutsukari or locker', 'Furano', '10:45', 30, 'Check-in proper is 16:00', 43.3420, 142.3830),
    stop('p0719d', 'Farm Tomita — lavender PEAK', 'Nakafurano', '11:30', 150, 'Lavender East too if Tomita is mobbed; melon soft-serve', 43.4180, 142.4273),
    stop('p0719e', 'Mutsukari check-in + rest', 'Furano', '15:30', 90, 'Confirmed Jul 19–21', 43.3420, 142.3830),
    stop('p0719f', 'Furano curry omurice dinner', 'Furano', '18:00', 75, 'Masaya or Kumagera', 43.3420, 142.3830),
    stop('p0719g', 'Ningle Terrace at dusk', 'Furano (New Prince)', '19:45', 75, 'Craft huts in the woods, lit at night — open till ~21:00', 43.3164, 142.4275),
  ]},
  '2026-07-20': { date: '2026-07-20', title: 'Biei — hills + Blue Pond', note: 'Rent a car or e-bike in Biei. 14:00 — Tokyo Disney 60-day ticket window opens (phone reminder set).', stops: [
    stop('p0720a', 'Train Furano → Biei', 'JR Furano line', '08:30', 40, '', 43.5883, 142.4670),
    stop('p0720b', 'Shikisai-no-oka flower fields', 'Biei', '09:30', 90, 'Rolling rainbow fields; alpaca pen', 43.5500, 142.4300),
    stop('p0720c', 'Patchwork Road viewpoints', 'Biei', '11:30', 90, 'Ken & Mary tree, Seven Stars tree', 43.6050, 142.4390),
    stop('p0720d', 'Shirogane Blue Pond + waterfall', 'Biei (Shirogane)', '14:00', 90, 'Best color in afternoon light', 43.4983, 142.6167),
    stop('p0720e', 'Back to Furano — onsen + dinner', 'Furano', '17:30', 150, '', 43.3420, 142.3830),
  ]},
  '2026-07-21': { date: '2026-07-21', title: 'Furano → Asahidake Onsen', note: 'Mutsukari out → JR to Asahikawa (~1h10) → Ideyu-go bus to Asahidake (~1h30, FEW departures — check times!). K\'s House check-in.', stops: [
    stop('p0721a', 'Train Furano → Asahikawa', 'JR Furano line', '09:30', 75, '', 43.7708, 142.3650),
    stop('p0721b', 'Asahikawa ramen lunch', 'Asahikawa', '11:15', 60, 'Shoyu ramen — Aoba or Santouka honten', 43.7640, 142.3600),
    stop('p0721c', 'Ideyu-go bus → Asahidake Onsen', 'Asahidake', '13:00', 95, 'Buy return; last buses are early', 43.6559, 142.8077),
    stop('p0721d', 'K\'s House check-in + onsen soak', 'Asahidake Onsen', '15:00', 180, 'Booked ✓ — screenshot the booking email; weak signal', 43.6559, 142.8077),
  ]},
  '2026-07-22': { date: '2026-07-22', title: 'Daisetsuzan — Asahidake hike', note: 'Weather decides — ropeway posts conditions at 08:00. Bear bell, layers, water.', stops: [
    stop('p0722a', 'Asahidake Ropeway up', 'Daisetsuzan', '08:30', 20, '~¥3,200 return; queue early', 43.6559, 142.8077),
    stop('p0722b', 'Sugatami Pond loop', 'Daisetsuzan', '09:00', 120, 'Fumaroles + pond reflections of the peak; easy loop', 43.6635, 142.8380),
    stop('p0722c', 'Optional: push toward Asahidake summit', 'Daisetsuzan', '11:00', 240, 'Clear weather only — 2.5–3h up, loose scree', 43.6633, 142.8542),
    stop('p0722d', 'Onsen + early dinner at the hostel', 'Asahidake Onsen', '16:30', 180, 'Legs earned it', 43.6559, 142.8077),
  ]},
  '2026-07-23': { date: '2026-07-23', title: 'Asahidake → Sapporo (last night)', note: 'K\'s House out. Bus → Asahikawa → Ltd Exp Kamui to Sapporo (~1h25). ⚠ Return-night bed still to confirm.', stops: [
    stop('p0723a', 'Morning onsen + bus down', 'Asahidake → Asahikawa', '09:30', 95, '', 43.7708, 142.3650),
    stop('p0723b', 'Ltd Exp Kamui → Sapporo', 'JR', '12:00', 85, '', 43.0687, 141.3508),
    stop('p0723c', 'Check in — Sapporo (1 night)', 'Sapporo', '14:00', 45, 'Confirm the booking!', 43.0455, 141.3567),
    stop('p0723d', 'Odori Beer Garden', 'Odori Park', '17:00', 150, 'Summer beer garden blocks along the park', 43.0609, 141.3466),
    stop('p0723e', 'Last-night Susukino wander', 'Susukino', '20:00', 90, 'Shime parfait — the Sapporo nightcap', 43.0555, 141.3535),
  ]},
  '2026-07-24': { date: '2026-07-24', title: 'Back to Tokyo — settle in', note: 'GK104 CTS 10:30 → NRT 12:10 → Tokyo. Tonight\'s bed depends on the share house (move-in ready?) — else a hostel for 24–26.', stops: [
    stop('p0724a', 'Flight GK104 CTS → NRT (10:30)', 'New Chitose', '08:30', 220, 'At CTS by 09:00; light bag = fast', 42.7752, 141.6923),
    stop('p0724b', 'NRT → Tokyo (Keisei/N\'EX)', 'Narita → Tokyo', '12:45', 75, '~¥1,300–3,000 depending on line', 35.6812, 139.7671),
    stop('p0724c', 'Check in — share house or hostel', 'Tokyo (TBD)', '14:30', 60, 'Drop the bag; share-house admin if you\'ve signed', 35.6987, 139.7855),
    stop('p0724d', 'Easy evening — decompress', 'Tokyo', '16:00', 180, '9 days in Hokkaido done; explore your new neighborhood or rest', 35.6987, 139.7855),
  ]},
  '2026-07-25': { date: '2026-07-25', title: 'Tokyo + Sumida River Fireworks', note: 'Home turf — fireworks launch right by Asakusa/Sumida (~15 min from Asakusabashi). ~20,000 shells, 19:00–20:30.', stops: [
    stop('p0725a', 'Slow morning / share-house errands', 'Tokyo', '10:00', 150, 'Laundry, settle in, coffee', 35.6987, 139.7855),
    stop('p0725b', 'Afternoon wander (Asakusa or new area)', 'Asakusa', '13:30', 180, 'Kappabashi kitchen street, Sensoji, or scout your share-house neighborhood', 35.7148, 139.7967),
    stop('p0725c', 'Stake out a fireworks spot', 'Sumida Park / Asakusa', '17:00', 120, '~950k people — riverbank near Sakurabashi, or the Shioiri Park (site 2) side', 35.7148, 139.8002),
    stop('p0725d', 'Sumida River Fireworks (19:00–20:30)', 'Sumida River', '19:00', 90, 'Two launch sites; leave before the finale barrage or accept the crush', 35.7148, 139.8002),
  ]},
  '2026-07-26': { date: '2026-07-26', title: 'Wonder Festival — Makuhari', note: 'Keiyo line → Kaihimmakuhari (~40 min). Advance day ticket flagged Jul 20. Doors 10:00–17:00.', stops: [
    stop('p0726a', 'Wonder Festival 2026 Summer', 'Makuhari Messe', '10:00', 300, 'Garage kits + cosplay; cash for the dealer hall; limited kits go by noon', 35.6480, 140.0343),
    stop('p0726b', 'Late lunch in Makuhari or back in town', 'Makuhari / Akihabara', '15:30', 90, '', 35.6480, 140.0343),
    stop('p0726c', 'Recovery evening — laundry + photo dump', 'Tokyo', '18:00', 120, 'Two big weeks done', 35.6987, 139.7855),
  ]},
  '2026-07-28': { date: '2026-07-28', title: 'Kamakura full loop → Enoshima sunset (moved)', note: 'Moved off the pre-Hokkaido days — do this once you\'re back and settled. This date is just a placeholder: drag it to whatever day suits. Leave Asakusabashi ~08:10 (Sobu → Shinagawa → Yokosuka line); Enoden day pass (Noriorikun ¥800) — you ride it 4×.', stops: [
    stop('p0728a', 'Kamakura Stn → Enoden → Hase', 'Kamakura', '09:45', 25, 'Day pass at the Enoden window', 35.3125, 139.5470),
    stop('p0728b', 'Kotoku-in — Great Buddha', 'Hase', '10:15', 75, '¥300; Hase-dera is 5 min away if you\'re ahead', 35.3167, 139.5358),
    stop('p0728c', 'Komachi-dori — street-food lunch', 'Kamakura', '12:00', 110, 'Eat as you walk: croquettes, dango, shirasu-man; souvenirs', 35.3211, 139.5531),
    stop('p0728d', 'Tsurugaoka Hachimangu', 'Kamakura', '14:00', 30, 'Straight up from the end of Komachi-dori', 35.3258, 139.5565),
    stop('p0728e', 'Hokokuji bamboo grove', 'Kamakura (Jomyoji)', '14:35', 60, '⚠ CLOSES 16:00 (last entry 15:30) — bus 23/24/36 ~10 min; matcha in the grove ¥600', 35.3204, 139.5735),
    stop('p0728f', 'Enoden → Kamakurakōkōmae — Slam Dunk crossing', 'Shonan coast', '17:00', 45, 'The opening-credits railroad crossing; Fuji across the bay on clear days', 35.3066, 139.5008),
    stop('p0728g', 'Enoden → Enoshima Stn → causeway walk', 'Enoshima', '18:10', 40, '~20 min walk to the island', 35.3040, 139.4800),
    stop('p0728h', 'Chigogafuchi — SUNSET', 'Enoshima (west cliffs)', '18:50', 50, 'Iwaya Caves close 17:00–18:00, so this is the sunset plaza instead — check the sunset time for your actual date', 35.2972, 139.4757),
    stop('p0728i', 'Shirasu-don dinner near the island', 'Enoshima', '19:50', 60, 'Raw shirasu if the catch allows; kamaage (steamed) otherwise', 35.3009, 139.4794),
    stop('p0728j', 'Enoshima Stn → home', 'Enoden / Odakyu / JR', '20:50', 90, 'Odakyu to Shinjuku or JR from Fujisawa; ~1h30 door to door', 35.6987, 139.7855),
  ]},
};
