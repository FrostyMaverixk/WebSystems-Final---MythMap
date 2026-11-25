// creatures.js
import * as THREE from 'three';

import { ORIGIN } from './config.js';
import { BILLBOARD_VERT, BILLBOARD_FRAG } from './shaders.js';

export function billboard(texture, viewport, width, height = width) {
  const material = new THREE.ShaderMaterial({
    vertexShader: BILLBOARD_VERT, fragmentShader: BILLBOARD_FRAG,
    uniforms: {
      uMap: { value: texture }, uSize: { value: new THREE.Vector2(width, height) },
      uViewport: { value: viewport }, uOpacity: { value: 1 }, uBob: { value: 0 },
    },
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.frustumCulled = false;
  return sprite;
}

function makeFallbackPinTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.beginPath();
    ctx.arc(24, 24, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#b34f35';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#f7f3e9';
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class CreatureSystem {
  constructor(scene, map, viewport, communityMarker = '') {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.map = map;
    this.viewport = viewport;
    this.communityMarker = communityMarker;
    this.textures = new Map();
    this.fallbackTexture = makeFallbackPinTexture();
    this.sprites = new Map();
    this.active = [];
    this.filterType = 'all';
    this.filterIds = null;
    this.loader = new THREE.TextureLoader();
  }

  setCommunityMarker(url) {
    if (!url || url === this.communityMarker) return;
    this.communityMarker = url;
    for (const sprite of this.sprites.values()) {
      const story = sprite.userData.story;
      if (story?.community) {
        sprite.material.uniforms.uMap.value = this.textureFor(story);
        sprite.userData.textureUrl = url;
      }
    }
    if (!this.disposed) this.map.triggerRepaint();
  }

  textureUrlFor(story) {
    return story.community ? this.communityMarker : (story.marker || '');
  }

  textureFor(story) {
    const url = this.textureUrlFor(story);
    if (!url) return this.fallbackTexture;
    if (!this.textures.has(url)) {
      const image = this.loader.load(
        url,
        () => {
          if (!this.disposed) this.map.triggerRepaint();
        },
        undefined,
        () => {
          // Keep fallback visual if an image fails to load.
        }
      );
      image.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(url, image);
    }
    return this.textures.get(url);
  }

  setDefinitions(definitions) {
    const retained = new Set(definitions.map((c) => c.id));
    for (const [id, sprite] of this.sprites) {
      if (!retained.has(id)) {
        this.group.remove(sprite);
        sprite.material.dispose();
        this.sprites.delete(id);
      }
    }
    for (const story of definitions) {
      let sprite = this.sprites.get(story.id);
      const nextUrl = this.textureUrlFor(story);
      if (!sprite) {
        sprite = billboard(this.textureFor(story), this.viewport, 48);
        sprite.userData.phase = Math.random() * Math.PI * 2;
        sprite.userData.textureUrl = nextUrl;
        this.group.add(sprite);
        this.sprites.set(story.id, sprite);
      } else if (sprite.userData.textureUrl !== nextUrl) {
        sprite.material.uniforms.uMap.value = this.textureFor(story);
        sprite.userData.textureUrl = nextUrl;
      }
      const anchor = mapboxgl.MercatorCoordinate.fromLngLat([story.lng, story.lat], 0);
      sprite.position.set(anchor.x - ORIGIN[0], anchor.y - ORIGIN[1], anchor.z);
      sprite.userData.story = story;
    }
    this.setFilters(this.filterType, this.filterIds);
  }

  setFilters(type = 'all', ids) {
    this.filterType = type;
    this.filterIds = ids == null ? null : new Set(ids);
    this.active = [];
    for (const sprite of this.sprites.values()) {
      const c = sprite.userData.story;
      const matches = type === 'all' || (type === 'community' ? c.community : c.type === type);
      sprite.visible = Boolean(matches && (!this.filterIds || this.filterIds.has(c.id)));
      if (sprite.visible) this.active.push(sprite);
    }
  }

  update(time, animate, terrain) {
    for (const sprite of this.active) {
      const data = sprite.userData, c = data.story;
      const point = this.map.project([c.lng, c.lat]);
      const onScreen = point.x > -100 && point.y > -100 &&
        point.x < this.viewport.x + 100 && point.y < this.viewport.y + 100;
      sprite.visible = onScreen;
      data.footprint = null;
      if (!onScreen) continue;

      const elevation = terrain ? this.map.queryTerrainElevation([c.lng, c.lat]) || 0 : 0;
      sprite.position.z = elevation ? mapboxgl.MercatorCoordinate.fromLngLat([c.lng, c.lat], elevation).z : 0;
      const width = (c.community ? 40 : 52) * (c.type === 'sea' ? 1.3 : 1);
      const uniforms = sprite.material.uniforms;
      const bob = animate ? 3 * Math.sin(time * 1.5 + data.phase) : 0;
      const img = uniforms.uMap.value.image;
      const height = img?.width ? width * img.height / img.width : width;
      uniforms.uSize.value.set(width, height);
      uniforms.uBob.value = bob;
      data.footprint = { left: -width / 2, right: width / 2, top: -height / 2 - bob, bottom: height / 2 - bob };
    }
  }

  hitTest(point) {
    let hit = null, nearest = Infinity;
    for (const sprite of this.active) {
      const { story, footprint } = sprite.userData;
      if (!footprint) continue;
      const p = this.map.project([story.lng, story.lat]);
      const x = point.x - p.x, y = point.y - p.y;
      if (x < footprint.left - 3 || x > footprint.right + 3 || y < footprint.top - 3 || y > footprint.bottom + 3) continue;
      const d = Math.hypot(x - (footprint.left + footprint.right) / 2, y - (footprint.top + footprint.bottom) / 2);
      if (d < nearest) { nearest = d; hit = story; }
    }
    return hit;
  }

  dispose() {
    this.disposed = true;
    for (const sprite of this.sprites.values()) sprite.material.dispose();
    for (const texture of this.textures.values()) texture.dispose();
    this.fallbackTexture.dispose();
    this.group.clear();
    this.sprites.clear();
    this.textures.clear();
    this.active = [];
  }
}
