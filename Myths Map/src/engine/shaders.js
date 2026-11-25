export const TRAIL_SLOTS = 64;
export const TRAIL_LIFETIME = 1.2;

export const NOISE_GLSL = `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.0; a *= 0.5; }
    return v;
  }
`;

export const WATER_VERT = `
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy;
    gl_Position = projectionMatrix * vec4(position, 1.0);
  }
`;

export const WATER_FRAG = `
  uniform float uTime, uWakeWidth, uCursorActive, uSwell;
  uniform int uActiveTrails;
  uniform vec2 uOrigin, uCursorWorld, uFieldMin, uFieldScale;
  uniform vec3 uDeep, uMid, uShallow;
  uniform sampler2D uDistanceField;
  uniform vec4 uTrail[${TRAIL_SLOTS}]; // Absolute Mercator XY + unit direction
  uniform float uAge[${TRAIL_SLOTS}];
  varying vec2 vLocal;
  ${NOISE_GLSL}
  const float TAU = 6.28318530718;
  void main() {
    vec2 displacement = vec2(0.0);
    float wakeDepth = 0.0, wakeCrest = 0.0;
    float width = uWakeWidth;
    if (uCursorActive > 0.5) {
      vec2 d = vLocal - (uCursorWorld - uOrigin);
      float d2 = dot(d, d);
      float env = exp(-d2 / (width * width * 2.777778));
      wakeDepth = env * 0.8;
      displacement += d * inversesqrt(max(d2, 1e-23)) * env * width;
    }
    float maxRadiusSq = 64.0 * width * width;
    for (int i = 0; i < ${TRAIL_SLOTS}; i++) {
      if (i >= uActiveTrails) break;
      vec2 d = vLocal - (uTrail[i].xy - uOrigin);
      if (dot(d, d) > maxRadiusSq) continue;
      vec2 fwd = uTrail[i].zw, lat = vec2(-fwd.y, fwd.x);
      float f = dot(d, fwd), l = dot(d, lat);
      float stretchedF = f < 0.0 ? f * 0.5 : f;
      float dist = length(vec2(stretchedF, l)) / width;
      float life = 1.0 - smoothstep(0.0, ${TRAIL_LIFETIME.toFixed(1)}, uAge[i]);
      float trough = exp(-dist * dist) * life;
      wakeDepth += trough;
      vec2 pushDir = vec2(stretchedF, l * 2.0);
      vec2 worldPush = fwd * pushDir.x + lat * pushDir.y;
      displacement += worldPush * inversesqrt(max(dot(worldPush, worldPush), 1e-23)) * trough * width;
      float crestD = (dist - 1.5) / 0.6;
      wakeCrest += exp(-crestD * crestD) * life;
    }
    wakeDepth = 1.0 - exp(-wakeDepth * 0.6);
    wakeCrest = 1.0 - exp(-wakeCrest * 0.3);
    vec2 uv = (vLocal - (uFieldMin - uOrigin) + displacement * 2.0) * uFieldScale;
    float depth = texture2D(uDistanceField, uv).r;
    vec3 col = mix(uShallow, uMid, smoothstep(0.0, 0.4, depth));
    col = mix(col, uDeep, smoothstep(0.4, 0.85, depth));

    // Restore the original east/north radians for noise and its 0.005-radian normal stencil.
    vec2 radiansXY = ((uOrigin - 0.5) + vLocal) * vec2(TAU, -TAU);
    vec2 p = radiansXY * 40.0 + vec2(uTime * 0.05, uTime * 0.03);
    float n1 = fbm(p);
    vec2 grad = n1 - vec2(fbm(p + vec2(0.2, 0.0)), fbm(p + vec2(0.0, 0.2)));
    vec2 push = displacement * vec2(TAU, -TAU);
    vec3 normal = normalize(vec3(-push * 30.0 + grad * (5.0 * uSwell), 1.0));
    vec3 lightDir = normalize(vec3(0.5, 0.8, 0.6));
    vec3 halfVec = normalize(lightDir + vec3(0.0, 0.0, 1.0));
    float diffuse = max(dot(normal, lightDir), 0.0);
    float specular = pow(max(dot(normal, halfVec), 0.0), 48.0);
    col *= mix(0.8, 1.2, diffuse);
    col += vec3(0.8, 0.9, 1.0) * specular * (0.15 + wakeCrest * 1.5 + wakeDepth * 0.5);
    if (wakeCrest > 0.001) {
      float foamNoise = fbm(radiansXY * 100.0 + vec2(uTime * 0.1));
      col += vec3(0.5, 0.6, 0.7) * smoothstep(0.6, 0.9, foamNoise) * wakeCrest * 0.2;
    }
    gl_FragColor = vec4(col * mix(1.0, 0.85, wakeDepth), 1.0);
    #include <colorspace_fragment>
  }
`;

// The map matrix projects each geographic anchor. Expanding the quad after
// projection cancels both exponential zoom and perspective foreshortening.
export const BILLBOARD_VERT = `
  uniform vec2 uViewport, uSize;
  uniform float uBob;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 screen = position.xy * uSize + vec2(0.0, uBob);
    gl_Position.xy += screen * (2.0 / uViewport) * gl_Position.w;
  }
`;
export const BILLBOARD_FRAG = `
  uniform sampler2D uMap;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec4 texel = texture2D(uMap, vUv);
    gl_FragColor = vec4(texel.rgb, texel.a * uOpacity);
    #include <colorspace_fragment>
  }
`;
