import { PH_BOUNDS } from './config.js';

export function setupInteraction({ canvas: container, world, stateRef, callbacks }) {
  const map = world.map;
  const canvas = map.getCanvas();
  const surface = map.getCanvasContainer();
  const dom = new AbortController();
  const listen = (element, type, callback, capture = false) =>
    element?.addEventListener(type, callback, { signal: dom.signal, capture });

  const clear = () => {
    surface.style.cursor = '';
    world.clearPointer();
  };

  const move = (event) => {
    if (map.isMoving() || event.originalEvent?.buttons || stateRef.current.placingPin) {
      clear();
      return;
    }
    surface.style.cursor = world.creatures.hitTest(event.point) ? 'pointer' : '';
    world.setPointer(event.point, mapboxgl.MercatorCoordinate.fromLngLat(event.lngLat));
  };

  const click = (event) => {
    if (stateRef.current.placingPin) {
      if (!stateRef.current.canWrite) {
        callbacks.onCancelPin?.();
        return;
      }
      const { lat, lng } = event.lngLat;
      const [[west, south], [east, north]] = PH_BOUNDS;
      if (lng < west || lng > east || lat < south || lat > north) {
        callbacks.onPinOutOfBounds?.();
        return;
      }
      callbacks.onPinLocation?.(lat, lng);
      return;
    }
    const story = world.creatures.hitTest(event.point);
    if (story) callbacks.onSelectStory?.(story);
    else callbacks.onClearSelection?.();
  };

  map.on('mousemove', move);
  map.on('movestart', clear);
  map.on('mouseout', clear);
  map.on('click', click);
  listen(surface, 'pointerleave', clear);

  // Native Mapbox keyboard handling lives on the canvas container. Keep the
  // existing atlas tab stop and forward focus to the native keyboard target.
  canvas.setAttribute('aria-label', container.getAttribute('aria-label') || '');
  canvas.tabIndex = -1;
  listen(container, 'focus', () => canvas.focus({ preventScroll: true }));
  listen(container, 'keydown', (event) => {
    if (![canvas, container].includes(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Home') callbacks.onResetMap?.();
    else if (event.key === '+' || event.key === '=') world.zoomBy(1);
    else if (event.key === '-') world.zoomBy(-1);
    else return; // Arrows, rotation and native gestures belong to Mapbox.
    event.preventDefault();
    event.stopPropagation();
  }, true);

  return () => {
    dom.abort();
    map.off('mousemove', move);
    map.off('movestart', clear);
    map.off('mouseout', clear);
    map.off('click', click);
    clear();
  };
}
