'use strict';
// Current local weather via Open-Meteo (free, keyless, CORS-friendly). The parse/label
// helpers are pure (import-safe in Node, unit-tested); fetchWeather is the thin network
// wrapper. The dashboard caches results in localStorage (KEYS.weather) — this module
// holds no state.

// WMO weather-interpretation codes → glyph + short label (the subset Open-Meteo emits).
const WMO = {
  0: ['☀️', 'Clear'], 1: ['🌤', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
  45: ['🌫', 'Fog'], 48: ['🌫', 'Icy fog'],
  51: ['🌦', 'Light drizzle'], 53: ['🌦', 'Drizzle'], 55: ['🌧', 'Heavy drizzle'],
  56: ['🌧', 'Freezing drizzle'], 57: ['🌧', 'Freezing drizzle'],
  61: ['🌦', 'Light rain'], 63: ['🌧', 'Rain'], 65: ['🌧', 'Heavy rain'],
  66: ['🌧', 'Freezing rain'], 67: ['🌧', 'Freezing rain'],
  71: ['🌨', 'Light snow'], 73: ['🌨', 'Snow'], 75: ['❄️', 'Heavy snow'], 77: ['❄️', 'Snow grains'],
  80: ['🌦', 'Showers'], 81: ['🌧', 'Showers'], 82: ['⛈', 'Violent showers'],
  85: ['🌨', 'Snow showers'], 86: ['🌨', 'Snow showers'],
  95: ['⛈', 'Thunderstorm'], 96: ['⛈', 'Thunder + hail'], 99: ['⛈', 'Thunder + hail'],
};
export function wmoInfo(code) {
  const hit = WMO[code] || ['🌡', 'Weather'];
  return { emoji: hit[0], label: hit[1] };
}

// Pure: Open-Meteo forecast JSON → the strip's view model. Returns null when the shape
// is wrong (API change, error body) so callers can treat it exactly like a failed fetch.
export function parseWeather(j) {
  const c = j && j.current, d = j && j.daily;
  if (!c || typeof c.temperature_2m !== 'number') return null;
  const num = (arr) => (d && Array.isArray(arr) && typeof arr[0] === 'number') ? Math.round(arr[0]) : null;
  // sunrise/sunset arrive as local ISO ("2026-07-02T04:28") — keep just HH:MM
  const hm = (arr) => (d && Array.isArray(arr) && typeof arr[0] === 'string' && /T\d\d:\d\d/.test(arr[0])) ? arr[0].slice(11, 16) : null;
  return {
    sunrise: hm(d && d.sunrise),
    sunset: hm(d && d.sunset),
    temp: Math.round(c.temperature_2m),
    feels: typeof c.apparent_temperature === 'number' ? Math.round(c.apparent_temperature) : null,
    code: typeof c.weather_code === 'number' ? c.weather_code : null,
    hi: num(d && d.temperature_2m_max),
    lo: num(d && d.temperature_2m_min),
    rainPct: num(d && d.precipitation_probability_max),
  };
}

// Fetch current + today's hi/lo/rain for a point. Throws on HTTP/network error or timeout;
// resolves null on an unexpected body. 6s deadline like the app's other fetches.
export async function fetchWeather(lat, lng) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}`
    + '&current=temperature_2m,apparent_temperature,weather_code'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset'
    + '&timezone=Asia%2FTokyo&forecast_days=1';
  const t = (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(6000) : undefined;
  const r = await fetch(url, { signal: t });
  if (!r.ok) throw new Error('open-meteo ' + r.status);
  return parseWeather(await r.json());
}
