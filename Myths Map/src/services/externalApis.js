import { MAPBOX_TOKEN } from '../config/appConfig.js';

const CACHE_PREFIX = 'myths-map-ext:';
const memoryCache = new Map();
const WEATHER_TTL_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

function readCache(key, ttlMs) {
  const now = Date.now();
  const mem = memoryCache.get(key);
  if (mem && now - mem.ts < ttlMs) return mem.value;
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && now - parsed.ts < ttlMs) {
        memoryCache.set(key, parsed);
        return parsed.value;
      }
    }
  } catch {
    // Ignore storage quota or private-browsing errors.
  }
  return undefined;
}

function writeCache(key, value) {
  const entry = { ts: Date.now(), value };
  memoryCache.set(key, entry);
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Ignore storage errors.
  }
}

async function fetchJsonWithTimeout(url, { timeoutMs = 7000, signal, headers } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...headers },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// ---------------------------------------------------------------------------
// 1. Mapbox Geocoding API v6 — Reverse Geocoding (Auto-Fill Region on Pin Drop)
// ---------------------------------------------------------------------------
export async function reverseGeocodeLocation(lat, lng, { signal } = {}) {
  if (!MAPBOX_TOKEN || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const key = `geo:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = readCache(key, SESSION_TTL_MS);
  if (cached !== undefined) return cached;

  const url = `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${encodeURIComponent(lng)}&latitude=${encodeURIComponent(lat)}&access_token=${encodeURIComponent(MAPBOX_TOKEN)}`;
  const data = await fetchJsonWithTimeout(url, { timeoutMs: 7000, signal });
  const props = data?.features?.[0]?.properties;
  if (!props) return null;

  const ctx = props.context || {};
  const primary =
    ctx.place?.name ||
    ctx.locality?.name ||
    ctx.district?.name ||
    props.name ||
    '';
  const secondary =
    ctx.region?.name ||
    ctx.district?.name ||
    ctx.country?.name ||
    '';

  const parts = [];
  if (primary) parts.push(primary);
  if (secondary && secondary.toLowerCase() !== primary.toLowerCase()) parts.push(secondary);

  const label = parts.join(', ').slice(0, 80).trim() || null;
  if (label) writeCache(key, label);
  return label;
}

// ---------------------------------------------------------------------------
// 2. Open-Meteo Weather API — Live Weather & Atmosphere Sync
// ---------------------------------------------------------------------------
const WMO_WEATHER = {
  0: { label: 'Clear sky', icon: '☀', nightIcon: '☽' },
  1: { label: 'Mostly clear', icon: '🌤', nightIcon: '☽' },
  2: { label: 'Partly cloudy', icon: '⛅', nightIcon: '☁' },
  3: { label: 'Overcast', icon: '☁', nightIcon: '☁' },
  45: { label: 'Misty fog', icon: '🌫', nightIcon: '🌫' },
  48: { label: 'Dense fog', icon: '🌫', nightIcon: '🌫' },
  51: { label: 'Light drizzle', icon: '🌦', nightIcon: '🌧' },
  53: { label: 'Drizzle', icon: '🌦', nightIcon: '🌧' },
  55: { label: 'Heavy drizzle', icon: '🌧', nightIcon: '🌧' },
  61: { label: 'Light rain', icon: '🌦', nightIcon: '🌧' },
  63: { label: 'Rain', icon: '🌧', nightIcon: '🌧' },
  65: { label: 'Heavy rain', icon: '🌧', nightIcon: '🌧' },
  80: { label: 'Rain showers', icon: '🌦', nightIcon: '🌧' },
  81: { label: 'Moderate showers', icon: '🌧', nightIcon: '🌧' },
  82: { label: 'Heavy showers', icon: '🌧', nightIcon: '🌧' },
  95: { label: 'Thunderstorm', icon: '⛈', nightIcon: '⛈' },
  96: { label: 'Storm with hail', icon: '⛈', nightIcon: '⛈' },
  99: { label: 'Severe storm', icon: '⛈', nightIcon: '⛈' },
};

function describeWeather(code, isDay) {
  const entry = WMO_WEATHER[code] || { label: 'Island air', icon: '☁', nightIcon: '☽' };
  return {
    label: entry.label,
    icon: isDay === 0 ? entry.nightIcon : entry.icon,
  };
}

export async function fetchLiveWeather(lat, lng, { signal } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const rLat = lat.toFixed(1);
  const rLng = lng.toFixed(1);
  const key = `weather:${rLat},${rLng}`;
  const cached = readCache(key, WEATHER_TTL_MS);
  if (cached !== undefined) return cached;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(rLat)}&longitude=${encodeURIComponent(rLng)}&current=temperature_2m,wind_speed_10m,weather_code,cloud_cover,is_day`;
  const data = await fetchJsonWithTimeout(url, { timeoutMs: 7000, signal });
  const current = data?.current;
  if (!current || typeof current.temperature_2m !== 'number') return null;

  const isDay = current.is_day === 0 ? 0 : 1;
  const info = describeWeather(current.weather_code, isDay);
  const weather = {
    temperature: Math.round(current.temperature_2m),
    windSpeed: Number(current.wind_speed_10m) || 0,
    weatherCode: Number(current.weather_code) || 0,
    cloudCover: Number(current.cloud_cover) || 0,
    isDay,
    label: info.label,
    icon: info.icon,
    dayPeriod: isDay === 0 ? 'Night' : 'Day',
  };
  writeCache(key, weather);
  return weather;
}

// ---------------------------------------------------------------------------
// 3. Wikipedia REST API — Cultural & Regional Lore Context
// ---------------------------------------------------------------------------
// Strictly verified, dedicated English Wikipedia articles for Philippine folklore creatures.
// Creatures without an exact dedicated article intentionally have no entry so unrelated
// ethnic, geographic, or homonym articles are never linked.
const CREATURE_WIKI_SLUGS = Object.freeze({
  amomongo: 'Amomongo',
  manananggal: 'Manananggal',
  sarimanok: 'Sarimanok',
  sigbin: 'Sigbin',
  tikbalang: 'Tikbalang',
  tiyanak: 'Tiyanak',
});

const COMMUNITY_CREATURE_WIKI_PATTERNS = [
  [/\bamomongo\b/i, 'Amomongo'],
  [/\baswang\b/i, 'Aswang'],
  [/\bbakunawa\b/i, 'Bakunawa'],
  [/\bbatibat\b/i, 'Batibat'],
  [/\bberberoka\b/i, 'Berberoka'],
  [/\bbungisngis\b/i, 'Bungisngis'],
  [/\bengkanto\b/i, 'Engkanto'],
  [/\bkapre\b/i, 'Kapre'],
  [/\bmanananggal\b/i, 'Manananggal'],
  [/\b(?:mariang?\s+makiling|diwata\s+of\s+mount\s+makiling)\b/i, 'Maria_Makiling'],
  [/\bnuno\s+sa\s+punso\b/i, 'Nuno_sa_punso'],
  [/\bsarimanok\b/i, 'Sarimanok'],
  [/\bsigb[ie]n\b/i, 'Sigbin'],
  [/\bsirena\b/i, 'Sirena_(Philippine_mythology)'],
  [/\bs(?:iy|h)okoy\b/i, 'Siyokoy'],
  [/\btikbalang\b/i, 'Tikbalang'],
  [/\btiyanak\b/i, 'Tiyanak'],
  [/\bwakwak\b/i, 'Wakwak'],
];

async function fetchWikiSummary(slug, signal) {
  const cleanSlug = String(slug || '').trim().replace(/\s+/g, '_');
  if (!cleanSlug) return null;
  const key = `wiki:v2:${cleanSlug.toLowerCase()}`;
  const cached = readCache(key, SESSION_TTL_MS);
  if (cached !== undefined) return cached;

  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanSlug)}`;
  const data = await fetchJsonWithTimeout(url, { timeoutMs: 7000, signal });
  if (!data || data.type !== 'standard' || !data.extract) {
    writeCache(key, null);
    return null;
  }

  const summary = {
    title: data.title || cleanSlug.replace(/_/g, ' '),
    description: data.description || '',
    extract: data.extract,
    url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(cleanSlug)}`,
  };
  writeCache(key, summary);
  return summary;
}

export async function fetchWikipediaLore(story, { signal } = {}) {
  if (!story) return null;

  let slug = null;
  if (!story.community) {
    slug = CREATURE_WIKI_SLUGS[story.id] || null;
  } else {
    const title = String(story.title || story.name || '');
    for (const [pattern, matchedSlug] of COMMUNITY_CREATURE_WIKI_PATTERNS) {
      if (pattern.test(title)) {
        slug = matchedSlug;
        break;
      }
    }
  }

  if (!slug || signal?.aborted) return null;
  return fetchWikiSummary(slug, signal);
}
