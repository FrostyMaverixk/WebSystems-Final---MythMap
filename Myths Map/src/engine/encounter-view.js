import * as THREE from 'three';
import {
  createEncounterModel,
  habitatOf,
  makeEnvironment,
  setAtmosphereTint,
  setHabitat,
  updateEncounterAtmosphere,
} from './encounter-scene.js';

const clamp = THREE.MathUtils.clamp;

export class EncounterView {
  constructor({ dialog, canvas, onClose }) {
    this.dialog = dialog;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.environment = makeEnvironment();
    this.controls = new AbortController();
    this.pointers = new Map();
    this.target = new THREE.Vector3();
    this.size = new THREE.Vector3();
    this.media = matchMedia('(prefers-reduced-motion: reduce)');
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
    this.onClose = onClose || (() => {});
    this.effects = true;
    this.atmosphere = { isDay: 1, weatherCode: 0, windSpeed: 10, moonPhase: null, waveHeight: null };
    this.lastDelta = 0;

    const listen = (target, type, fn, options) =>
      target.addEventListener(type, fn, { ...options, signal: this.controls.signal });
    listen(this.dialog, 'close', () => { if (!this.dialog.open) this.releaseModel(); });
    listen(this.media, 'change', () => this.refreshMotion());
    listen(this.canvas, 'wheel', (event) => {
      event.preventDefault();
      this.zoom(Math.exp(-clamp(event.deltaY, -120, 120) * 0.002));
    }, { passive: false });
    listen(this.canvas, 'pointerdown', (event) => {
      if (event.button !== 0) return;
      this.canvas.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, [event.clientX, event.clientY]);
      this.canvas.focus({ preventScroll: true });
    });
    const pinch = () => {
      const [a, b] = this.pointers.values();
      return Math.hypot(a[0] - b[0], a[1] - b[1]);
    };
    listen(this.canvas, 'pointermove', (event) => {
      const prev = this.pointers.get(event.pointerId);
      if (!prev) return;
      const prevDistance = this.pointers.size === 2 ? pinch() : 0;
      this.pointers.set(event.pointerId, [event.clientX, event.clientY]);
      if (prevDistance > 0) this.zoom(pinch() / prevDistance);
      else if (this.pointers.size === 1) {
        this.rotate((prev[0] - event.clientX) * 0.012, (event.clientY - prev[1]) * 0.008);
      }
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      listen(this.canvas, type, (e) => this.pointers.delete(e.pointerId));
    }
    listen(this.canvas, 'keydown', (event) => {
      switch (event.key) {
        case '+': case '=': this.zoom(1.15); break;
        case '-': this.zoom(1 / 1.15); break;
        case 'ArrowLeft': this.rotate(-0.15, 0); break;
        case 'ArrowRight': this.rotate(0.15, 0); break;
        case 'ArrowUp': this.rotate(0, 0.08); break;
        case 'ArrowDown': this.rotate(0, -0.08); break;
        default: return;
      }
      event.preventDefault();
    });
  }

  open(story, effects, atmosphere = {}) {
    this.releaseModel(false);
    this.model = createEncounterModel(story.id);
    this.effects = effects;
    this.atmosphere = { ...this.atmosphere, ...atmosphere };
    setHabitat(this.environment, habitatOf(story), this.atmosphere);
    this.environment.scene.add(this.model.group);
    const bounds = new THREE.Box3().setFromObject(this.model.group);
    bounds.getCenter(this.target);
    bounds.getSize(this.size);
    this.yaw = 0;
    this.elevation = 0.06;
    this.magnification = 1;
    this.elapsed = 0;
    this.lastDelta = 0;
    if (!this.dialog.open) this.dialog.showModal();
    this.resize();
    this.refreshMotion();
  }

  setAtmosphere({ effects, ...atmosphere } = {}) {
    if (effects !== undefined) this.effects = effects;
    this.atmosphere = { ...this.atmosphere, ...atmosphere };
    setAtmosphereTint(this.environment, this.atmosphere);
    this.refreshMotion();
  }

  resize() {
    if (!this.model || !this.dialog.open) return;
    const width = Math.max(1, this.canvas.clientWidth), height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    const camera = this.environment.camera;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    this.draw(0);
  }

  rotate(x, y) {
    this.yaw += x;
    this.elevation = clamp(this.elevation + y, 0.01, 0.85);
    this.draw(0);
  }

  zoom(factor) {
    this.magnification = clamp(this.magnification * factor, 0.65, 1.65);
    this.draw(0);
  }

  draw(delta = 0) {
    if (!this.model || !this.dialog.open) return;
    const { camera, scene } = this.environment;
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    const span = Math.max(this.size.x, this.size.z);
    const fit = Math.max(this.size.y, span / camera.aspect) / (1.55 * tangent) + span / 2;
    const progress = this.animate ? clamp(this.elapsed / 0.7, 0, 1) : 1;
    const approach = 1 - progress * progress * (3 - 2 * progress);
    const distance = Math.max(4.5, fit) / this.magnification + approach * 3;
    const angle = this.elevation + approach * 0.24;
    const horizontal = Math.cos(angle) * distance;
    camera.position.set(
      this.target.x + Math.sin(this.yaw) * horizontal,
      this.target.y + Math.sin(angle) * distance,
      this.target.z + Math.cos(this.yaw) * horizontal
    );
    camera.lookAt(this.target);
    this.model.animate(this.elapsed);
    updateEncounterAtmosphere(this.environment, this.elapsed, delta, this.animate);
    this.renderer.render(scene, camera);
  }

  refreshMotion() {
    this.renderer.setAnimationLoop(null);
    if (!this.model || !this.dialog.open) return;
    this.animate = this.effects && !this.media.matches;
    if (this.animate) {
      let previous = performance.now();
      this.renderer.setAnimationLoop((time) => {
        const delta = clamp((time - previous) / 1000, 0, 0.1);
        previous = time;
        this.elapsed += delta;
        this.draw(delta);
      });
    }
    this.draw(0);
  }

  releaseModel(notify = true) {
    if (!this.model) return;
    this.renderer.setAnimationLoop(null);
    this.environment.scene.remove(this.model.group);
    this.model.dispose();
    this.model = null;
    this.pointers.clear();
    if (notify) this.onClose();
  }

  close() {
    if (this.dialog.open) this.dialog.close();
    this.releaseModel(true);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseModel(false);
    if (this.dialog.open) this.dialog.close();
    this.controls.abort();
    this.resizeObserver.disconnect();
    const geometries = new Set(), materials = new Set();
    this.environment.scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
      if (object.isInstancedMesh) object.dispose();
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    for (const tex of this.environment.textures || []) tex.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
