import { STYLE_URL, useLocalCoastline } from './config.js';
import { setupUI } from './ui.js';
import { ApiClient } from './api.js';

const container = document.getElementById('map');
const loading = document.getElementById('loading');
const status = document.getElementById('map-status');
const retry = document.getElementById('retry-map');
const mapState = { placingPin: false, ready: false };

// The reader and all account actions start even if the GPU, token or tiles are unavailable.
const placeholder = {
  highQuality: !matchMedia('(prefers-reduced-motion: reduce)').matches,
  setHighQuality(value) { this.highQuality = value; },
  setCommunityMyths() {}, setFilters() {}, focusOn() {}, fitCameraToWorld() {}, resize() {}, dispose() {},
};
const ui = setupUI(placeholder, mapState);
let world, removeInteraction, pending = false, closed = false;
let reported = '';

function report(message) {
  reported = message;
  status.textContent = message + ' You can still read stories in Discover.';
  retry.classList.remove('hidden');
}

function loadMapbox() {
  if (globalThis.mapboxgl) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/assets/mapbox-gl-3.35.2/mapbox-gl.js';
    script.onload = () => globalThis.mapboxgl ? resolve() : reject(new Error('Mapbox GL JS could not initialize.'));
    script.onerror = () => { script.remove(); reject(new Error('Mapbox GL JS could not load.')); };
    document.head.append(script);
  });
}

async function initializeMap() {
  if (pending || closed) return;
  pending = true;
  reported = '';
  retry.classList.add('hidden');
  loading.classList.remove('hidden');
  status.textContent = 'Charting the Philippine isles…';
  if (world) {
    mapState.ready = false;
    ui.resetActionButton();
    removeInteraction?.();
    removeInteraction = undefined;
    world.dispose();
    world = undefined;
    ui.setWorld(placeholder);
  }
  try {
    const config = await new ApiClient().request('/config');
    if (!config.mapboxToken) throw new Error('Set MAPBOX_TOKEN to a public Mapbox token and restart the local server.');
    const [, { World }, { setupInteraction }] = await Promise.all([
      loadMapbox(), import('./world.js'), import('./interaction.js'),
    ]);
    if (!config.mapboxStyle) {
      const response = await fetch(STYLE_URL);
      if (!response.ok) throw new Error('The bundled atlas style could not be loaded.');
      config.mapboxStyle = useLocalCoastline(await response.json(), window.location.origin);
    }
    if (closed) return;
    world = new World(container, config, report);
    await world.load();
    if (closed) return;
    ui.setWorld(world);
    removeInteraction = setupInteraction({ canvas: container, world, ui, mapState });
    mapState.ready = true;
    if (!reported) status.textContent = 'Drag to explore · Scroll to zoom · Select a creature to read its story';
  } catch (error) {
    if (closed) return;
    world?.dispose();
    world = undefined;
    ui.setWorld(placeholder);
    report(error.message || 'The interactive map could not start.');
  } finally {
    loading.classList.add('hidden');
    pending = false;
  }
}

retry.addEventListener('click', initializeMap);
const observer = new ResizeObserver((entries) => {
  for (const { target } of entries) {
    if (target === container) world?.resize();
    else document.documentElement.style.setProperty('--notice-clearance', Math.max(38, Math.ceil(target.getBoundingClientRect().height) + 4) + 'px');
  }
});
observer.observe(container);
observer.observe(document.querySelector('.map-notice'));
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  closed = true;
  observer.disconnect();
  ui.dispose();
  removeInteraction?.();
  world?.dispose();
});
initializeMap();
