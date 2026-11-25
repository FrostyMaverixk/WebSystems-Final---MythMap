import * as THREE from 'three';
import { COLORS, CREATURES, MAX_BOUNDS, MAX_ZOOM, MIN_ZOOM, ORIGIN, PH_BOUNDS, STYLE_URL, mercatorBounds } from './config.js';
import { billboard, CreatureSystem } from './creatures.js';
import { TRAIL_LIFETIME, TRAIL_SLOTS, WATER_FRAG, WATER_VERT } from './shaders.js';

const OCEAN = 'ocean-shader';
const OVERLAY = 'creatures-and-clouds';
const nowSeconds = () => performance.now() / 1000;
const regionOrigin = new THREE.Matrix4().makeTranslation(...ORIGIN, 0);

function makeWater() {
  const bounds = mercatorBounds(MAX_BOUNDS);
  const fallback = new THREE.DataTexture(new Uint8Array([128]), 1, 1, THREE.RedFormat);
  fallback.needsUpdate = true;
  const uniforms = {
    uTime: { value: 0 }, uWakeWidth: { value: 0 }, uCursorActive: { value: 0 }, uSwell: { value: 1.0 },
    uCursorWorld: { value: new THREE.Vector2() }, uOrigin: { value: new THREE.Vector2(...ORIGIN) },
    uFieldMin: { value: new THREE.Vector2(bounds.minX, bounds.minY) },
    uFieldScale: { value: new THREE.Vector2(1 / (bounds.maxX - bounds.minX), 1 / (bounds.maxY - bounds.minY)) },
    uDistanceField: { value: fallback }, uActiveTrails: { value: 0 },
    uTrail: { value: Array.from({ length: TRAIL_SLOTS }, () => new THREE.Vector4()) },
    uAge: { value: new Float32Array(TRAIL_SLOTS) },
    uDeep: { value: new THREE.Color(COLORS.oceanDeep) }, uMid: { value: new THREE.Color(COLORS.oceanMid) },
    uShallow: { value: new THREE.Color(COLORS.oceanShallow) },
  };
  const geometry = new THREE.PlaneGeometry(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  geometry.translate((bounds.minX + bounds.maxX) / 2 - ORIGIN[0], (bounds.minY + bounds.maxY) / 2 - ORIGIN[1], 0);
  const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    uniforms, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
    side: THREE.DoubleSide, depthWrite: false, depthFunc: THREE.LessEqualDepth,
  }));
  mesh.frustumCulled = false;
  return mesh;
}

// Select the largest unobstructed rectangle bordering the reader. At phone
// widths this is usually above it; on a desktop it is usually to the left.
function readerPadding(container) {
  const map = container.getBoundingClientRect();
  const panel = document.querySelector('#details-panel');
  const empty = { top: 0, bottom: 0, left: 0, right: 0 };
  if (!panel || panel.classList.contains('hidden')) return empty;
  const r = panel.getBoundingClientRect();
  if (r.right <= map.left || r.left >= map.right || r.bottom <= map.top || r.top >= map.bottom) return empty;
  const choices = [
    ['right', map.right - r.left, map.width, map.height],
    ['left', r.right - map.left, map.width, map.height],
    ['bottom', map.bottom - r.top, map.height, map.width],
    ['top', r.bottom - map.top, map.height, map.width],
  ];
  choices.sort((a, b) => (b[2] - b[1]) * b[3] - (a[2] - a[1]) * a[3]);
  const [edge, amount, limit] = choices[0];
  return { ...empty, [edge]: Math.max(0, Math.min(Math.ceil(amount), Math.floor(limit) - 1)) };
}

export class World {
  constructor(container, config, report = () => {}) {
    this.container = container;
    this.report = report;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.highQuality = config.highQuality ?? !this.reducedMotion.matches;
    this.windMultiplier = 1;
    this.targetSwell = 1.0;
    this.builtinCreatures = Array.isArray(config.creatures) ? config.creatures : CREATURES;
    this.communityRecords = [];
    this.map = new mapboxgl.Map({
      container, accessToken: config.mapboxToken, style: config.mapboxStyle || STYLE_URL,
      projection: 'mercator', bounds: PH_BOUNDS, fitBoundsOptions: { padding: 12 },
      maxBounds: MAX_BOUNDS, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, maxPitch: 30,
      antialias: true, attributionControl: true, renderWorldCopies: false, trackResize: false,
    });
    this.viewport = new THREE.Vector2();
    this.camera = new THREE.Camera();
    this.tileMatrix = new THREE.Matrix4();
    this.ocean = new THREE.Scene();
    this.scene = new THREE.Scene();
    this.water = makeWater();
    this.ocean.add(this.water);
    this.uniforms = this.water.material.uniforms;
    this.trails = [];
    this.clouds = [];
    this.creatures = new CreatureSystem(this.scene, this.map, this.viewport, config.communityMarker || '');
    this._syncDefinitions();
    this._buildClouds();
    this.time = 0;
    this.lastFrame = nowSeconds();
    this.map.on('zoomend', this.syncPitch);
    this.reducedMotion.addEventListener('change', this.onMotionChange);
  }

  _syncDefinitions() {
    this.creatures.setDefinitions([
      ...this.builtinCreatures,
      ...this.communityRecords.map((r) => ({ ...r, name: r.title || r.name, community: true })),
    ]);
  }

  setBuiltinCreatures(creatures, communityMarker = '') {
    if (Array.isArray(creatures)) {
      this.builtinCreatures = creatures;
    }
    if (communityMarker) {
      this.creatures.setCommunityMarker(communityMarker);
    }
    this._syncDefinitions();
    if (!this.disposed) this.map.triggerRepaint();
  }

  setWindSpeed(windSpeedKmh) {
    if (typeof windSpeedKmh === 'number' && Number.isFinite(windSpeedKmh) && windSpeedKmh >= 0) {
      // Gently scale drifting cloud speed from calm (~0.65x) to windy (~2.4x).
      this.windMultiplier = Math.max(0.65, Math.min(2.4, 0.65 + windSpeedKmh / 24));
    } else {
      this.windMultiplier = 1;
    }
  }

  setWaveHeight(waveHeightMeters) {
    if (typeof waveHeightMeters === 'number' && Number.isFinite(waveHeightMeters) && waveHeightMeters >= 0) {
      // Modulate ocean ripple intensity subtly from calm (0.85) to strong swell (1.6).
      this.targetSwell = Math.max(0.85, Math.min(1.6, 0.85 + waveHeightMeters * 0.35));
    } else {
      this.targetSwell = 1.0;
    }
    this.uniforms.uSwell.value = this.highQuality ? this.targetSwell : 1.0;
  }

  async load() {
    this.grain = new Image();
    this.grain.src = '/assets/parchment-grain.svg';
    const grainReady = this.grain.decode().catch(() => { this.grain = null; });
    this.loadDistanceField();
    // The style may already be ready by the time the grain image decodes.
    await new Promise((resolve, reject) => {
      let initial = true;
      const finish = (error) => {
        if (!initial) return;
        initial = false;
        clearTimeout(timeout);
        this.cancelLoad = null;
        if (error) reject(error);
        else resolve();
      };
      const timeout = setTimeout(() => finish(new Error('Mapbox did not finish loading. Check the token, style URL and connection.')), 25000);
      this.cancelLoad = () => finish(new Error('Map closed.'));
      this.onError = (event) => {
        if (this.disposed) return;
        const status = event.error?.status;
        if (event.sourceId === 'relief' && this.map.getSource('atlas-local-dem')) {
          this.useLocalElevation = true;
          if (this.map.getLayer(OVERLAY)) this.restoreLocalElevation();
          return;
        }
        if (event.sourceId) {
          this.report(event.sourceId === 'ph-coastline'
            ? 'The local coastline could not load. Check public/assets/ph-coastline.json.'
            : 'Some hosted map details could not load. Check the connection or tileset access.');
          return;
        }
        if (status === 401 || status === 403 || (!event.sourceId && !this.map.isStyleLoaded() && initial)) {
          const message = 'Mapbox could not load the configured map. Check the public token, allowed URLs and style access.';
          if (initial) finish(new Error(message));
          else this.report(message);
        }
      };
      this.map.on('error', this.onError);
      this.onStyle = async () => {
        await grainReady;
        if (this.disposed) return;
        try {
          this.installLayers();
          if (initial) finish();
        } catch (error) {
          if (initial) finish(error);
          else this.report('The map layers could not be restored.');
        }
      };
      this.map.on('style.load', this.onStyle);
      if (this.map.isStyleLoaded()) this.onStyle();
    });
  }

  async loadDistanceField() {
    let texture;
    try {
      const response = await fetch('/assets/ph-distance-field.json');
      if (!response.ok) return;
      const { bounds, flipY, rowZero } = await response.json();
      if (flipY !== false || rowZero !== 'north' || !bounds ||
          !Object.values(bounds).every(Number.isFinite) || !(bounds.maxX > bounds.minX && bounds.maxY > bounds.minY)) return;
      texture = await new THREE.TextureLoader().loadAsync('/assets/ph-distance-field.png');
      if (this.disposed) { texture.dispose(); return; }
      texture.flipY = false;
      texture.colorSpace = THREE.NoColorSpace;
      texture.generateMipmaps = false;
      texture.minFilter = texture.magFilter = THREE.LinearFilter;
      this.uniforms.uFieldMin.value.set(bounds.minX, bounds.minY);
      this.uniforms.uFieldScale.value.set(1 / (bounds.maxX - bounds.minX), 1 / (bounds.maxY - bounds.minY));
      this.uniforms.uDistanceField.value.dispose();
      this.uniforms.uDistanceField.value = texture;
      this.redrape = true;
      this.map.triggerRepaint();
    } catch { /* The neutral one-pixel distance field remains usable. */ }
  }

  restoreLocalElevation() {
    const terrain = this.map.getTerrain();
    if (terrain?.source === 'relief') {
      this.map.setTerrain({ ...terrain, source: 'atlas-local-dem' });
      this.redrape = true;
      this.map.triggerRepaint();
    }
  }

  installLayers() {
    const map = this.map;
    map.setProjection('mercator');
    if (this.grain && !map.hasImage('parchment-grain')) map.addImage('parchment-grain', this.grain);
    if (map.getLayer(OCEAN)) return;
    if (!map.getTerrain()) {
      const dem = Object.entries(map.getStyle().sources).find(([, source]) => source.type === 'raster-dem')?.[0] || 'atlas-elevation';
      if (!map.getSource(dem)) {
        map.addSource(dem, { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
      }
      map.setTerrain({ source: dem, exaggeration: ['interpolate', ['linear'], ['zoom'], 6, 0, 9, 1.25, 12, 1.6] });
    }
    const layers = map.getStyle().layers || [];
    if (this.useLocalElevation && map.getSource('atlas-local-dem')) this.restoreLocalElevation();
    const land = layers.find((l) => l.id === 'ph-land') ||
      layers.find((l) => l.type === 'fill' && /^(land|landmass|land-base|land-fill)$/i.test(l.id));
    let before = land?.id;
    if (!before) {
      const anchor = layers.find((l) => l.type === 'symbol')?.id;
      const slot = map.getSlots?.().includes('bottom') ? 'bottom' : undefined;
      if (!map.getSource('atlas-coast-mask')) map.addSource('atlas-coast-mask', { type: 'vector', url: 'mapbox://mapbox.country-boundaries-v1' });
      before = 'atlas-coast-fill';
      map.addLayer({ id: before, type: 'fill', ...(slot ? { slot } : {}), source: 'atlas-coast-mask', 'source-layer': 'country_boundaries',
        filter: ['all', ['==', ['get', 'disputed'], 'false'], ['any', ['==', ['get', 'worldview'], 'all'], ['in', 'US', ['get', 'worldview']]]],
        paint: { 'fill-color': ['case', ['==', ['get', 'iso_3166_1'], 'PH'], COLORS.landBase, '#9caa9e'] },
      }, anchor);
    }
    map.addLayer({
      id: OCEAN, type: 'custom', renderingMode: '2d', slot: map.getSlot(before),
      render: (gl, matrix) => this.drawOcean(gl, matrix),
      renderToTile: (gl, { x, y, z }) => {
        const s = 2 ** (z + 1);
        this.tileMatrix.set(s, 0, 0, -2 * x - 1, 0, s, 0, -2 * y - 1, 0, 0, 1, 0, 0, 0, 0, 1);
        this.drawOcean(gl, this.tileMatrix.elements, true);
      },
      shouldRerenderTiles: () => this.highQuality || this.redrape,
    }, before);
    map.addLayer({
      id: OVERLAY, type: 'custom', renderingMode: '3d',
      render: (gl, matrix) => {
        const time = nowSeconds();
        const delta = this.highQuality ? Math.min(time - this.lastFrame, 0.1) : 0;
        this.lastFrame = time;
        this.time += delta;
        this.viewport.set(Math.max(1, this.container.clientWidth), Math.max(1, this.container.clientHeight));
        this.creatures.update(this.time, this.highQuality && !this.reducedMotion.matches, map.getTerrain());
        if (this.highQuality) this.updateClouds(delta);
        this.draw(gl, matrix, this.scene);
        this.redrape = false;
        if (this.highQuality && !this.encounterOpen) this.map.triggerRepaint();
      },
    });
  }

  makeRenderer(gl) {
    const flip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
    const premultiply = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.map.getCanvas(), context: gl, antialias: true });
      this.renderer.autoClear = false;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    } finally {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
    }
  }

  drawOcean(gl, matrix, tile = false) {
    this.water.material.depthTest = !tile && gl.isEnabled(gl.DEPTH_TEST);
    this.uniforms.uTime.value = this.time;
    this.uniforms.uWakeWidth.value = 7.5 / (512 * 2 ** this.map.getZoom());
    this.packTrails();
    this.draw(gl, matrix, this.ocean);
  }

  draw(gl, matrix, scene) {
    const draw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
    const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    const viewport = gl.getParameter(gl.VIEWPORT);
    const restoreTarget = () => {
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
      gl.viewport(...viewport);
    };
    if (!this.renderer) this.makeRenderer(gl);
    this.camera.projectionMatrix.fromArray(matrix).multiply(regionOrigin);
    this.renderer.resetState();
    try {
      restoreTarget();
      this.renderer.render(scene, this.camera);
    } finally {
      this.renderer.resetState();
      restoreTarget();
    }
  }

  setPointer(point, coordinate) {
    if (!this.highQuality) return;
    this.uniforms.uCursorActive.value = 1;
    this.uniforms.uCursorWorld.value.set(coordinate.x, coordinate.y);
    const last = this.lastPointer;
    if (last && Math.hypot(point.x - last.sx, point.y - last.sy) < 5) return;
    if (last) {
      const dx = coordinate.x - last.x, dy = coordinate.y - last.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0) {
        if (this.trails.length === TRAIL_SLOTS) this.trails.shift();
        this.trails.push({ x: coordinate.x, y: coordinate.y, dx: dx / distance, dy: dy / distance, born: nowSeconds() });
      }
    }
    this.lastPointer = { x: coordinate.x, y: coordinate.y, sx: point.x, sy: point.y };
  }

  clearPointer() {
    this.uniforms.uCursorActive.value = 0;
    this.lastPointer = null;
  }

  packTrails() {
    const time = nowSeconds();
    while (this.trails.length && time - this.trails[0].born >= TRAIL_LIFETIME) this.trails.shift();
    this.uniforms.uActiveTrails.value = this.trails.length;
    for (let i = 0; i < this.trails.length; i++) {
      const p = this.trails[i];
      this.uniforms.uTrail.value[i].set(p.x, p.y, p.dx, p.dy);
      this.uniforms.uAge.value[i] = time - p.born;
    }
  }

  _buildClouds() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');

    [[30, 48, 23, 18], [48, 36, 24, 23], [70, 38, 27, 24], [91, 49, 21, 17], [62, 53, 38, 15]]
      .forEach(([x, y, rx, ry]) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(rx, ry);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0,    'rgba(255, 255, 255, 0.68)');
        g.addColorStop(0.55, 'rgba(255, 255, 255, 0.42)');
        g.addColorStop(1,    'rgba(255, 255, 255, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.restore();
      });

    const cloudTex = new THREE.CanvasTexture(canvas);
    cloudTex.colorSpace = THREE.SRGBColorSpace;

    this.cloudTexture = cloudTex;
    for (let i = 0; i < 5; i++) {
      const cloud = billboard(cloudTex, this.viewport, 1);
      cloud.visible = this.highQuality;
      cloud.renderOrder = -1;
      this.scene.add(cloud);
      this.respawnCloud(cloud, i);
      cloud.userData.age = 5 + i * 3;
      this.clouds.push(cloud);
    }
  }

  respawnCloud(cloud, index) {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const x = width * (0.1 + (index + Math.random() * 0.6) * 0.16);
    const y = height * (0.12 + ((index * 3) % 5 + Math.random() * 0.6) * 0.15);
    const location = this.map.unproject([x, y]);
    const anchor = mapboxgl.MercatorCoordinate.fromLngLat(location);
    cloud.position.set(anchor.x - ORIGIN[0], anchor.y - ORIGIN[1], anchor.z);
    cloud.userData = {
      lng: location.lng, lat: location.lat, width: 110 + Math.random() * 90,
      age: 0, lifetime: 38 + Math.random() * 28, opacity: 0.42 + Math.random() * 0.15,
      speed: 4 + Math.random() * 3,
    };
  }

  updateClouds(delta) {
    const worldPixels = 512 * 2 ** this.map.getZoom();
    const windScale = this.windMultiplier || 1;
    for (const [index, cloud] of this.clouds.entries()) {
      const s = cloud.userData;
      const point = this.map.project([s.lng, s.lat]);
      s.age += delta;
      if (s.age >= s.lifetime || point.x < -s.width || point.y < -s.width ||
          point.x > this.viewport.x + s.width || point.y > this.viewport.y + s.width) {
        this.respawnCloud(cloud, index);
        cloud.material.uniforms.uOpacity.value = 0;
        continue;
      }
      const elevation = this.map.getTerrain() ? this.map.queryTerrainElevation([s.lng, s.lat]) || 0 : 0;
      cloud.position.z = mapboxgl.MercatorCoordinate.fromLngLat([s.lng, s.lat], elevation).z + 8 / worldPixels;
      const step = (s.speed * windScale) * delta / worldPixels;
      cloud.position.x += step;
      cloud.position.y -= step * 0.18;
      s.lng += step * 360;
      s.lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (cloud.position.y + ORIGIN[1])))) * 180 / Math.PI;
      cloud.material.uniforms.uSize.value.set(s.width, s.width * 0.6);
      cloud.material.uniforms.uOpacity.value = s.opacity * Math.min(1, s.age / 2, (s.lifetime - s.age) / 4);
    }
  }

  setCommunityMyths(records) {
    const approved = (records || []).filter((r) => r.status === 'approved' && Number.isFinite(r.lat) && Number.isFinite(r.lng));
    const signature = JSON.stringify(approved.map((r) => [r.id, r.lat, r.lng, r.type, r.title]));
    if (signature === this.communitySignature) return;
    this.communitySignature = signature;
    this.communityRecords = approved;
    this._syncDefinitions();
    if (!this.disposed) this.map.triggerRepaint();
  }

  setFilters(type, ids) {
    this.creatures.setFilters(type, ids);
    if (!this.disposed) this.map.triggerRepaint();
  }

  setHighQuality(on) {
    if (this.highQuality === on) return;
    this.highQuality = on;
    this.clearPointer();
    this.trails.length = 0;
    for (const cloud of this.clouds) cloud.visible = on;
    this.uniforms.uSwell.value = on ? this.targetSwell : 1.0;
    this.lastFrame = nowSeconds();
    this.redrape = true;
    this.syncPitch();
    if (!this.disposed) this.map.triggerRepaint();
  }

  pitchAt(zoom) {
    if (this.reducedMotion.matches || !this.highQuality) return 0;
    const t = Math.max(0, Math.min(1, (zoom - 6) / 4));
    return 30 * t * t * (3 - 2 * t);
  }

  syncPitch = () => {
    if (this.disposed) return;
    const pitch = this.pitchAt(this.map.getZoom());
    if (Math.abs(this.map.getPitch() - pitch) > 0.1) {
      this.map.easeTo({ pitch, duration: this.highQuality && !this.reducedMotion.matches ? 300 : 0 });
    }
  };

  onMotionChange = () => this.syncPitch();

  zoomBy(delta) {
    if (this.disposed) return;
    this.map.zoomTo(this.map.getZoom() + delta, {
      duration: this.highQuality && !this.reducedMotion.matches ? 250 : 0,
    });
  }

  focusOn(lat, lng) {
    if (this.disposed || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const zoom = Math.max(this.map.getZoom(), 9.5);
    this.map.easeTo({
      center: [lng, lat], zoom, pitch: this.pitchAt(zoom),
      padding: readerPadding(this.container), retainPadding: false,
      duration: this.highQuality && !this.reducedMotion.matches ? 850 : 0,
    });
  }

  fitCameraToWorld() {
    if (this.disposed) return;
    this.map.fitBounds(PH_BOUNDS, {
      padding: 12, bearing: 0, pitch: 0, linear: true, retainPadding: false,
      duration: this.highQuality && !this.reducedMotion.matches ? 600 : 0,
    });
  }

  setEncounterOpen(open) {
    this.encounterOpen = open;
    this.clearPointer();
    if (!open && !this.disposed) this.map.triggerRepaint();
  }

  resize() {
    if (!this.disposed) this.map.resize();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelLoad?.();
    this.reducedMotion.removeEventListener('change', this.onMotionChange);
    this.map.off('zoomend', this.syncPitch);
    if (this.onStyle) this.map.off('style.load', this.onStyle);
    if (this.onError) this.map.off('error', this.onError);
    for (const id of [OVERLAY, OCEAN]) {
      try {
        if (this.map.getStyle() && this.map.getLayer(id)) this.map.removeLayer(id);
      } catch {
        // Ignore teardown races when unmounting before style.load completes (StrictMode).
      }
    }
    this.creatures.dispose();
    for (const cloud of this.clouds) cloud.material.dispose();
    this.cloudTexture.dispose();
    this.water.geometry.dispose();
    this.water.material.dispose();
    this.uniforms.uDistanceField.value.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    try {
      this.map.remove();
    } catch {
      // Ignore partial initialization cleanup errors.
    }
  }
}
