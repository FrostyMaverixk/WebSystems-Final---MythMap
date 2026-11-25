export const MIN_ZOOM = 4.5;
export const MAX_ZOOM = 15;
export const PH_BOUNDS = [[116, 4], [127, 22]];
export const MAX_BOUNDS = [[110, 0], [133, 26]];
export const STYLE_URL = '/assets/atlas-style.json';
// Keep the Studio recipe publishable. The local edition supplies the three
// Philippine polygon layers from the same-origin coastline shipped with the app.
export function useLocalCoastline(style, origin = '') {
  style.sources['ph-coastline'] = { type: 'geojson', data: '/assets/ph-coastline.json', maxzoom: 15 };
  style.sources['atlas-local-dem'] = {
    type: 'raster-dem', encoding: 'terrarium', tileSize: 256, minzoom: 4, maxzoom: 8,
    bounds: [115.5, 3.5, 127.5, 22.5], tiles: [origin + '/assets/elevation/{z}/{x}/{y}.png'],
    attribution: '<a href="https://registry.opendata.aws/terrain-tiles/">Terrain: Mapzen, USGS, NOAA</a>',
  };
  for (const layer of style.layers) {
    if (layer.id === 'engraved-relief') layer.source = 'atlas-local-dem';
    if (['ph-land', 'ph-parchment', 'ph-shore'].includes(layer.id)) {
      layer.source = 'ph-coastline';
      delete layer['source-layer'];
      delete layer.filter;
    }
  }
  return style;
}

export const COLORS = {
  oceanDeep: '#112b39', oceanMid: '#1d4656', oceanShallow: '#3c6b77',
  landBase: '#e9d9b6', landDark: '#c9ae82', paper: '#f7f3e9', ink: '#243b3e',
};

// Same normalized units as Mapbox MercatorCoordinate, also usable by the offline baker.
export const mercX = (lng) => (lng + 180) / 360;
export const mercY = (lat) => (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2;
export const ORIGIN = [mercX(121.5), mercY(13)];
export function mercatorBounds([[west, south], [east, north]]) {
  return { minX: mercX(west), minY: mercY(north), maxX: mercX(east), maxY: mercY(south) };
}

// Marker coordinates are illustrative and do not define a tradition's geographic origin.
export const CREATURES = [
  { id: 'amdag', name: 'Amdag', lat: 18.2, lng: 120.7, type: 'land', banner: 'assets/banners/amdag.webp', habitat: 'Mists and open landscapes', story: 'An elusive spectral presence, illustrated as ghostly faces drifting together on a curling gust. Its flowing form suggests a spirit that is felt before it is seen.' },
  { id: 'amomongo', name: 'Amomongo', lat: 10.15, lng: 123.25, type: 'land', banner: 'assets/banners/amomongo.webp', habitat: 'Forests and caves', story: 'A shaggy, ape-like creature with long arms and formidable claws. Its crouching silhouette belongs to the wild, shadowed places of folklore.' },
  { id: 'borak', name: 'Borak', lat: 6.65, lng: 124.35, type: 'land', banner: 'assets/banners/borak.webp', habitat: 'Skies and mountain landscapes', story: 'A wondrous winged horse with a human-like face. The illustration joins a horse’s powerful body with broad wings, giving this figure a graceful, otherworldly presence.' },
  { id: 'buyagan', name: 'Buyagan', lat: 16.8, lng: 120.6, type: 'land', banner: 'assets/banners/buyagan.webp', habitat: 'Villages and wooded landscapes', story: 'A haunting figure pictured with long dark hair, staring eyes and a fierce expression. The artwork evokes the unease and caution carried by tales of uncanny encounters.' },
  { id: 'duwende', name: 'Duwende', lat: 14.9, lng: 120.55, type: 'land', banner: 'assets/banners/duwende.webp', habitat: 'Earth mounds, gardens and old trees', story: 'Small, elusive beings associated with the earth and hidden places. Duwende stories often remind travelers to show respect when passing an unseen neighbor’s home.' },
  { id: 'janggu', name: 'Janggu', lat: 8.25, lng: 125.65, type: 'land', banner: 'assets/banners/janggu.webp', habitat: 'Deep forests', story: 'A powerful, shaggy beast with a broad face, a curved tail and oversized claws. Its illustrated stance captures the watchful strength of a creature at home in the forest.' },
  { id: 'magindara', name: 'Magindara', lat: 13.5, lng: 123.8, type: 'sea', banner: 'assets/banners/magindara.webp', habitat: 'Seas and coastal waters', story: 'Enchanted mermaids whose beauty and voices draw listeners toward the water. Their long fish tails and flowing hair make them unmistakable figures of sea folklore.' },
  { id: 'manananggal', name: 'Manananggal', lat: 11.35, lng: 122.35, type: 'land', banner: 'assets/banners/manananggal.webp', habitat: 'Villages after dark', story: 'A nocturnal creature that separates its upper body and takes flight on bat-like wings. The dangling strands beneath its torso are a familiar part of its fearsome silhouette.' },
  { id: 'mangyan_nature_spirit', name: 'Mangyan Nature Spirit', lat: 12.8, lng: 121.1, type: 'land', banner: 'assets/banners/mangyan_nature_spirit.webp', habitat: 'Forests and mountain landscapes', story: 'A nature-spirit illustration framed by branching antlers, leaves and twigs. The quiet, crouching figure expresses a close connection between spirit, forest and living landscape.' },
  { id: 'mumu', name: 'Mumu', lat: 17.45, lng: 121.75, type: 'land', banner: 'assets/banners/mumu.webp', habitat: 'Quiet paths and old houses', story: 'A familiar name for a ghost or frightening unseen presence. This illustration gives the mumu a pale robe and long dark hair that conceals its face.' },
  { id: 'sarimanok', name: 'Sarimanok', lat: 12.5, lng: 124.5, type: 'land', banner: 'assets/banners/sarimanok.webp', habitat: 'Legendary gardens and landscapes', story: 'The richly ornamented mythical bird of Maranao tradition. Its proud crest and curling tail give it an elegant silhouette, celebrated in art and storytelling.' },
  { id: 'sigbin', name: 'Sigbin', lat: 9.75, lng: 124.15, type: 'land', banner: 'assets/banners/sigbin.webp', habitat: 'Forest edges after dark', story: 'An uncanny animal with long ears, a hunched back and an unusual backward-looking posture. The creature’s odd shape makes even a brief glimpse feel unsettling.' },
  { id: 'tambanokano', name: 'Tambanokano', lat: 7.1, lng: 126.6, type: 'sea', banner: 'assets/banners/tambanokano.webp', habitat: 'Deep waters beneath the moon', story: 'An enormous crab associated with stories of the moon. Its broad shell and great pincers turn a familiar shore creature into a being of extraordinary scale.' },
  { id: 'tarabusaw', name: 'Tarabusaw', lat: 7.6, lng: 124.65, type: 'land', banner: 'assets/banners/tarabusaw.webp', habitat: 'Remote forests and hills', story: 'A towering, wild-looking giant with a shaggy head, long arms and massive hands. The illustration emphasizes its imposing strength and rugged, human-like form.' },
  { id: 'tikbalang', name: 'Tikbalang', lat: 8.5, lng: 124.5, type: 'land', banner: 'assets/banners/tikbalang.webp', habitat: 'Forests and winding trails', story: 'A horse-headed, human-bodied trickster of the forests. Stories tell of travelers losing their way when a tikbalang confuses familiar paths.' },
  { id: 'tiyanak', name: 'Tiyanak', lat: 14.0, lng: 121.65, type: 'land', banner: 'assets/banners/tiyanak.webp', habitat: 'Wooded paths and secluded places', story: 'A deceptive creature that takes the form of a crying infant. The illustration reveals its uncanny side through pointed ears, sharp claws and a fanged mouth.' },
  { id: 'white_deer', name: 'White Deer', lat: 15.9, lng: 121.2, type: 'land', banner: 'assets/banners/white_deer.webp', habitat: 'Quiet forest clearings', story: 'A pale deer pictured resting among leaves beneath a magnificent crown of branching antlers. Its calm, luminous appearance evokes the wonder of an unexpected forest encounter.' }
].map((story) => ({
  ...story,
  illustration: `assets/${story.id}.png`,
  marker: `assets/ink/${story.id}.png`,
}));
