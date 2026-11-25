import { MAPBOX_TOKEN } from '../config/appConfig.js';

const CACHE_PREFIX = 'myths-map-ext:';
const memoryCache = new Map();
const WEATHER_TTL_MS = 15 * 60 * 1000; // 15 minutes
const SOLAR_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
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
// 3. Open-Meteo Marine API — Live Wave & Swell Conditions (Sea Creatures)
// ---------------------------------------------------------------------------
const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function toCompass(degrees) {
  if (typeof degrees !== 'number' || !Number.isFinite(degrees)) return 'N';
  const index = Math.round((((degrees % 360) + 360) % 360) / 45) % 8;
  return COMPASS_POINTS[index];
}

function describeSeaState(heightMeters) {
  if (heightMeters < 0.3) return 'Calm';
  if (heightMeters < 0.9) return 'Gentle swell';
  if (heightMeters < 1.8) return 'Moderate waves';
  return 'Rough seas';
}

export async function fetchMarineConditions(lat, lng, { signal } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const rLat = lat.toFixed(1);
  const rLng = lng.toFixed(1);
  const key = `marine:${rLat},${rLng}`;
  const cached = readCache(key, WEATHER_TTL_MS);
  if (cached !== undefined) return cached;

  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${encodeURIComponent(rLat)}&longitude=${encodeURIComponent(rLng)}&current=wave_height,wave_direction,wave_period,swell_wave_height`;
  const data = await fetchJsonWithTimeout(url, { timeoutMs: 7000, signal });
  const current = data?.current;
  if (!current || typeof current.wave_height !== 'number') return null;

  const waveHeight = Math.round(current.wave_height * 100) / 100;
  const waveDirection = Number(current.wave_direction) || 0;
  const wavePeriod = Number(current.wave_period) || 0;
  const swellHeight =
    typeof current.swell_wave_height === 'number'
      ? Math.round(current.swell_wave_height * 100) / 100
      : waveHeight;

  const marine = {
    waveHeight,
    waveDirection,
    compass: toCompass(waveDirection),
    wavePeriod,
    swellHeight,
    seaState: describeSeaState(waveHeight),
  };
  writeCache(key, marine);
  return marine;
}

// ---------------------------------------------------------------------------
// 4. Sunrise-Sunset API + Lunar Phase — Philippine Twilight & Moon Context
// ---------------------------------------------------------------------------
function formatManilaTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
}

function getManilaDateKey(nowMs = Date.now()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(nowMs));
  } catch {
    return new Date(nowMs).toISOString().slice(0, 10);
  }
}

export function getLunarPhase(date = new Date()) {
  const SYNODIC_MONTH = 29.53058867;
  const REF_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);
  const daysSince = (date.getTime() - REF_NEW_MOON_MS) / 86_400_000;
  const cycle = (((daysSince / SYNODIC_MONTH) % 1) + 1) % 1;
  const index = Math.floor(cycle * 8 + 0.5) % 8;
  const phases = [
    { name: 'New Moon', icon: '🌑' },
    { name: 'Waxing Crescent', icon: '🌒' },
    { name: 'First Quarter', icon: '🌓' },
    { name: 'Waxing Gibbous', icon: '🌔' },
    { name: 'Full Moon', icon: '🌕' },
    { name: 'Waning Gibbous', icon: '🌖' },
    { name: 'Last Quarter', icon: '🌗' },
    { name: 'Waning Crescent', icon: '🌘' },
  ];
  return phases[index];
}

export async function fetchSunriseSunset(lat, lng, { signal } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const rLat = lat.toFixed(1);
  const rLng = lng.toFixed(1);
  const phDate = getManilaDateKey();
  const key = `sun:${rLat},${rLng}:${phDate}`;
  const cached = readCache(key, SOLAR_TTL_MS);
  if (cached !== undefined) return cached;

  const url = `https://api.sunrise-sunset.org/json?lat=${encodeURIComponent(rLat)}&lng=${encodeURIComponent(rLng)}&formatted=0`;
  const data = await fetchJsonWithTimeout(url, { timeoutMs: 7000, signal });
  const results = data?.results;
  if (data?.status !== 'OK' || !results?.sunrise || !results?.sunset) return null;

  const sunriseLabel = formatManilaTime(results.sunrise);
  const sunsetLabel = formatManilaTime(results.sunset);
  if (!sunriseLabel || !sunsetLabel) return null;

  const totalSeconds = Number(results.day_length) || 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  const daylightLabel = totalSeconds > 0 ? `${hours}h ${minutes}m` : '';

  const solar = {
    sunrise: results.sunrise,
    sunset: results.sunset,
    civilTwilightBegin: results.civil_twilight_begin || '',
    civilTwilightEnd: results.civil_twilight_end || '',
    sunriseLabel,
    sunsetLabel,
    daylightLabel,
    moonPhase: getLunarPhase(),
  };
  writeCache(key, solar);
  return solar;
}

// ---------------------------------------------------------------------------
// 5. Wikipedia REST API — Strictly Accurate Creature Lore Context
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

// ---------------------------------------------------------------------------
// 6. Open Library API — Philippine Folklore Reference Literature
// ---------------------------------------------------------------------------
const OPENLIBRARY_QUERIES = Object.freeze({
  amdag: 'Maximo Ramos Philippine lower mythology',
  amomongo: 'Maximo Ramos Creatures of Philippine lower mythology',
  borak: 'Damiana Eugenio Philippine folk literature',
  buyagan: 'Maximo Ramos Creatures of Philippine lower mythology',
  duwende: 'Salvador Paraiso balete book Philippine',
  janggu: 'Maximo Ramos Philippine lower mythology',
  magindara: 'Maximo Ramos Creatures of Philippine lower mythology',
  manananggal: 'Manananggal Aswang Philippine folklore',
  mangyan_nature_spirit: 'Philippine folk literature Mangyan folklore',
  mumu: 'Maximo Ramos Creatures of Philippine lower mythology',
  sarimanok: 'Sarimanok Maranao Philippine folklore',
  sigbin: 'Maximo Ramos Creatures of Philippine lower mythology',
  tambanokano: 'Fay-Cooper Cole Traditions Mindanao Philippine',
  tarabusaw: 'Damiana Eugenio Philippine folk literature',
  tikbalang: 'Tikbalang Maximo Ramos Philippine',
  tiyanak: 'Tiyanak Maximo Ramos Philippine',
  white_deer: 'Damiana Eugenio Philippine folk literature',
});

const FOLKLORE_BOOK_RE =
  /philipp|folklore|myth|legend|balete|aswang|tinguian|maranao|mindanao|visay|luzon|tagalog|creatures|diwata|ramos|eugenio|cole|paraiso|manananggal|tikbalang|tiyanak|sarimanok|bakunawa|kapre/i;

export async function fetchOpenLibraryBooks(story, { signal } = {}) {
  if (!story) return [];

  let query = 'Maximo Ramos Philippine lower mythology';
  if (!story.community && OPENLIBRARY_QUERIES[story.id]) {
    query = OPENLIBRARY_QUERIES[story.id];
  } else if (story.community) {
    const title = String(story.title || story.name || '');
    for (const [pattern, wikiSlug] of COMMUNITY_CREATURE_WIKI_PATTERNS) {
      if (pattern.test(title)) {
        const cleanTerm = wikiSlug.replace(/_\(.+\)$/, '').replace(/_/g, ' ');
        query = `${cleanTerm} Philippine folklore`;
        break;
      }
    }
  }

  const key = `openlib:v1:${query.toLowerCase()}`;
  const cached = readCache(key, SESSION_TTL_MS);
  if (cached !== undefined) return cached;

  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=6&fields=key,title,author_name,first_publish_year,cover_i`;
  const data = await fetchJsonWithTimeout(url, { timeoutMs: 8000, signal });
  const docs = Array.isArray(data?.docs) ? data.docs : [];

  const seenTitles = new Set();
  const books = [];
  for (const doc of docs) {
    const workKey = typeof doc?.key === 'string' ? doc.key : '';
    const title = typeof doc?.title === 'string' ? doc.title.trim() : '';
    if (!workKey.startsWith('/works/') || !title) continue;

    const author = Array.isArray(doc.author_name) ? doc.author_name[0] || '' : '';
    const combinedText = `${title} ${author}`;
    if (!FOLKLORE_BOOK_RE.test(combinedText)) continue;

    const norm = title.toLowerCase();
    if (seenTitles.has(norm)) continue;
    seenTitles.add(norm);

    books.push({
      key: workKey,
      title,
      author: author || 'Philippine folklore archive',
      year: typeof doc.first_publish_year === 'number' ? doc.first_publish_year : null,
      coverUrl:
        typeof doc.cover_i === 'number'
          ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-S.jpg`
          : '',
      url: `https://openlibrary.org${workKey}`,
    });
    if (books.length >= 3) break;
  }

  writeCache(key, books);
  return books;
}

// ---------------------------------------------------------------------------
// 7. Wikimedia Commons API — Verified Archival Philippine Folklore Media
// ---------------------------------------------------------------------------
const COMMONS_VERIFIED_FILES = Object.freeze({
  manananggal: ['File:Manananggal of Philippine Mythology Commons.jpg', 'File:Manananggal.jpg'],
  sarimanok: [
    'File:Sarimanok bird of Philippine Folklore.jpg',
    'File:Maranao okir (Sarimanok feather design).jpg',
  ],
  tikbalang: ['File:Tikbalang The Philippine Demon Horse Commons.jpg'],
});

const COMMUNITY_COMMONS_PATTERNS = [
  [/\bmanananggal\b/i, COMMONS_VERIFIED_FILES.manananggal],
  [/\bsarimanok\b/i, COMMONS_VERIFIED_FILES.sarimanok],
  [/\btikbalang\b/i, COMMONS_VERIFIED_FILES.tikbalang],
  [/\bkapre\b/i, ['File:Kapre of Philippine Folklore Commons.jpg']],
  [
    /\b(?:mariang?\s+makiling|diwata\s+of\s+mount\s+makiling)\b/i,
    ['File:MariaMakiling Philippinefolklore.JPG'],
  ],
];

function stripHtmlTags(raw) {
  return String(raw || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchWikimediaCommonsMedia(story, { signal } = {}) {
  if (!story) return [];

  let files = null;
  if (!story.community) {
    files = COMMONS_VERIFIED_FILES[story.id] || null;
  } else {
    const title = String(story.title || story.name || '');
    for (const [pattern, matchedFiles] of COMMUNITY_COMMONS_PATTERNS) {
      if (pattern.test(title)) {
        files = matchedFiles;
        break;
      }
    }
  }

  if (!files?.length || signal?.aborted) return [];

  const key = `commons:v1:${files.join('|').toLowerCase()}`;
  const cached = readCache(key, SESSION_TTL_MS);
  if (cached !== undefined) return cached;

  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&titles=${encodeURIComponent(
    files.join('|')
  )}&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=360`;
  const data = await fetchJsonWithTimeout(url, { timeoutMs: 8000, signal });
  const pages = Object.values(data?.query?.pages || {});

  const items = [];
  for (const page of pages) {
    if (page?.missing !== undefined) continue;
    const info = page?.imageinfo?.[0];
    if (!info || !String(info.mime || '').startsWith('image/')) continue;
    if (!info.thumburl || !info.descriptionurl) continue;

    const cleanTitle = String(page.title || '')
      .replace(/^File:/i, '')
      .replace(/\.[^.]+$/, '')
      .replace(/_/g, ' ');
    const artist = stripHtmlTags(info.extmetadata?.Artist?.value).slice(0, 80);
    const license = stripHtmlTags(info.extmetadata?.LicenseShortName?.value).slice(0, 40);

    items.push({
      title: cleanTitle,
      thumbUrl: info.thumburl,
      pageUrl: info.descriptionurl,
      artist,
      license,
    });
  }

  writeCache(key, items);
  return items;
}
