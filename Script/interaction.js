import { PH_BOUNDS } from './config.js';

export function setupInteraction({ canvas: container, world, ui, mapState }) {
  const map = world.map;
  const canvas = map.getCanvas();
  const surface = map.getCanvasContainer();
  const dom = new AbortController();
  const listen = (element, type, callback, capture = false) =>
    element.addEventListener(type, callback, { signal: dom.signal, capture });
  const clear = () => { surface.style.cursor = ''; world.clearPointer(); };
  const move = (event) => {
    if (map.isMoving() || event.originalEvent?.buttons || mapState.placingPin) { clear(); return; }
    surface.style.cursor = world.creatures.hitTest(event.point) ? 'pointer' : '';
    world.setPointer(event.point, mapboxgl.MercatorCoordinate.fromLngLat(event.lngLat));
  };
  const click = (event) => {
    if (mapState.placingPin) {
      if (!['admin', 'user'].includes(ui.getRole())) { ui.resetActionButton(); return; }
      const { lat, lng } = event.lngLat;
      const [[west, south], [east, north]] = PH_BOUNDS;
      if (lng < west || lng > east || lat < south || lat > north) {
        document.getElementById('map-status').textContent = 'Choose a location within the Philippine map area. Press Escape to cancel.';
        return;
      }
      ui.showMythForm(lat, lng);
      return;
    }
    const story = world.creatures.hitTest(event.point);
    if (story) ui.showCreaturePopup(story);
    else ui.hidePopup();
  };
  const zoom = (delta) => map.zoomTo(map.getZoom() + delta, {
    duration: world.highQuality && !world.reducedMotion.matches ? 250 : 0,
  });
  map.on('mousemove', move);
  map.on('movestart', clear);
  map.on('mouseout', clear);
  map.on('click', click);
  listen(surface, 'pointerleave', clear);
  // Native Mapbox keyboard handling lives on the canvas container. Keep the
  // existing atlas tab stop and forward focus to the native keyboard target.
  canvas.setAttribute('aria-label', container.getAttribute('aria-label'));
  canvas.tabIndex = -1;
  listen(container, 'focus', () => canvas.focus({ preventScroll: true }));
  listen(document.getElementById('zoom-in'), 'click', () => zoom(1));
  listen(document.getElementById('zoom-out'), 'click', () => zoom(-1));
  listen(container, 'keydown', (event) => {
    if (![canvas, container].includes(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Home') document.getElementById('reset-map').click();
    else if (event.key === '+' || event.key === '=') zoom(1);
    else if (event.key === '-') zoom(-1);
    else return; // Arrows, rotation and native gestures belong to Mapbox.
    event.preventDefault();
    event.stopPropagation();
  }, true);
  return () => {
    dom.abort();
    map.off('mousemove', move); map.off('movestart', clear);
    map.off('mouseout', clear); map.off('click', click);
    clear();
  };
}
