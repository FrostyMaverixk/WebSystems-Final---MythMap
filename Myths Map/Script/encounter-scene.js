import * as THREE from '../assets/three-0.160.0/three.module.min.js';

const ENCOUNTER_MODEL_IDS = Object.freeze([
  'amdag', 'amomongo', 'borak', 'buyagan', 'duwende', 'janggu', 'magindara',
  'manananggal', 'mangyan_nature_spirit', 'mumu', 'sarimanok', 'sigbin',
  'tambanokano', 'tarabusaw', 'tikbalang', 'tiyanak', 'white_deer'
]);

const PALETTE = {
  parchment: 0xd9c6a1, pale: 0xeee0bd, charcoal: 0x30241f,
  brown: 0x795d43, fur: 0x574435, red: 0x8f3027, leaf: 0x6f7861,
  gold: 0xb89a61, shadow: 0x171513
};
const SILHOUETTES = {
  amdag: 'dark wind-carried soul hunters with a net', amomongo: 'long-armed shaggy ape',
  borak: 'human-faced winged horse', buyagan: 'human curse-speaker with long hair and a raised hand',
  duwende: 'seated pointed-hat gnome', janggu: 'clawed shaggy beast with curved tail',
  magindara: 'long-haired mermaid with curling fish tail',
  manananggal: 'winged separated torso with hanging entrails',
  mangyan_nature_spirit: 'seated antlered figure framed by leaves',
  mumu: 'long-haired apparition with a narrow face and ragged sleeves', sarimanok: 'crested bird with a fan of curled plumes',
  sigbin: 'long-eared hunched quadruped', tambanokano: 'spiny Mandaya crab with long legs and raised pincers beneath a moon',
  tarabusaw: 'long-armed shaggy giant', tikbalang: 'crouching horse-headed humanoid',
  tiyanak: 'crawling fanged infant', white_deer: 'resting deer with branching antlers'
};

// Only the selected creature is constructed. Geometry and palette materials are
// shared within that model, with no global GPU cache for abandoned encounters.
export function createEncounterModel(id) {
  if (!ENCOUNTER_MODEL_IDS.includes(id)) throw new RangeError(`Unknown encounter creature: ${id}`);
  const group = new THREE.Group();
  group.name = `encounter-${id}`;
  const rig = new THREE.Group();
  group.add(rig);
  const geometries = new Map(), materials = new Map(), motions = [];
  let disposed = false;

  function geometry(kind) {
    if (!geometries.has(kind)) {
      let result;
      if (kind === 'sphere') result = new THREE.SphereGeometry(1, 8, 6);
      else if (kind === 'box') result = new THREE.BoxGeometry(1, 1, 1);
      else if (kind === 'cone') result = new THREE.ConeGeometry(1, 1, 8);
      else if (kind === 'cylinder') result = new THREE.CylinderGeometry(1, 1, 1, 8);
      else {
        // A low-poly bat/horse wing with a scalloped trailing edge. The root is
        // its local origin, allowing a mirrored pair to flap without rebuilding.
        result = new THREE.BufferGeometry();
        result.setAttribute('position', new THREE.Float32BufferAttribute([
          0, 0, 0, 0.55, 0.7, 0, 1.35, 0.85, 0, 1.18, -0.28, 0,
          0.88, 0, 0, 0.62, -0.42, 0, 0.35, -0.12, 0, 0, -0.48, 0
        ], 3));
        result.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 6, 0, 6, 7]);
        result.computeVertexNormals();
      }
      geometries.set(kind, result);
    }
    return geometries.get(kind);
  }
  function material(color) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({
      color: PALETTE[color], flatShading: true, roughness: 0.95, metalness: 0,
      side: THREE.DoubleSide
    }));
    return materials.get(color);
  }
  function part(name, kind, at, size, color = 'parchment', rotation = [0, 0, 0], parent = rig) {
    const mesh = new THREE.Mesh(geometry(kind), material(color));
    mesh.name = name;
    mesh.position.set(...at);
    mesh.scale.set(...size);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const oval = (name, at, size, color, rotation) => part(name, 'sphere', at, size, color, rotation);
  const cone = (name, at, size, color, rotation) => part(name, 'cone', at, size, color, rotation);
  function bone(name, a, b, radius, color = 'parchment') {
    const direction = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a));
    const mesh = part(name, 'cylinder', a.map((value, index) => (value + b[index]) / 2), [radius, direction.length(), radius], color);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return mesh;
  }
  function path(name, points, radius, color = 'parchment') {
    for (let index = 1; index < points.length; index++) bone(`${name}-${index}`, points[index - 1], points[index], radius * (1 - index / (points.length * 1.8)), color);
  }
  function eyes(at, separation = 0.12, radius = 0.045, parent = rig) {
    for (const side of [-1, 1]) part('eye', 'sphere', [at[0] + side * separation, at[1], at[2]], [radius, radius, radius * 0.6], 'red', [0, 0, 0], parent);
  }
  function claws(at, spread = 0.11, color = 'pale') {
    for (let index = -1; index <= 1; index++) cone('claw', [at[0] + index * spread, at[1], at[2]], [0.045, 0.28, 0.045], color, [Math.PI / 2, 0, 0]);
  }
  function motion(object, axis, amplitude, speed = 1.3, phase = 0) {
    motions.push({ object, axis, base: object.rotation[axis], amplitude, speed, phase });
    return object;
  }
  function wings(at, size = 1, color = 'brown') {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * at[0], at[1], at[2]);
      rig.add(pivot);
      part(side < 0 ? 'left-wing' : 'right-wing', 'wing', [0, 0, 0], [side * size, size, size], color, [0, 0, 0], pivot);
      motion(pivot, 'y', 0.13 * side, 1.5, 0.4);
    }
  }
  function antlers(at, height = 1, width = 1) {
    for (const side of [-1, 1]) {
      const root = [at[0] + side * 0.15, at[1], at[2]];
      const fork = [at[0] + side * width * 0.55, at[1] + height * 0.5, at[2] - 0.1];
      const tip = [at[0] + side * width * 0.7, at[1] + height, at[2] - 0.2];
      path('antler', [root, fork, tip], 0.035, 'brown');
      bone('antler-branch', fork, [at[0] + side * width, at[1] + height * 0.75, at[2] + 0.08], 0.026, 'brown');
      bone('antler-tine', [at[0] + side * width * 0.35, at[1] + height * 0.25, at[2] - 0.04], [at[0] + side * width * 0.3, at[1] + height * 0.75, at[2]], 0.022, 'brown');
    }
  }
  function humanHead(at, size = 1, hair = true) {
    if (hair) oval('long-hair', [at[0], at[1] - size * 0.1, at[2] - size * 0.12], [0.37 * size, 0.55 * size, 0.31 * size], 'charcoal');
    const head = oval('face', at, [0.28 * size, 0.36 * size, 0.26 * size], 'parchment');
    eyes([at[0], at[1] + 0.03 * size, at[2] + 0.245 * size], 0.105 * size, 0.035 * size);
    return head;
  }

  switch (id) {
    case 'amdag': {
      // Nabaloi accounts describe wind-carried soul hunters with nets. The dark
      // streaming bodies and skull-like faces are the supplied artist's choice.
      path('gust', [[-1.55, 0.45, 0], [-1.15, 0.85, -0.1], [-0.35, 1.2, -0.15], [0.3, 1.8, -0.2]], 0.075, 'fur');
      for (const [x, y, z, scale] of [[-0.62, 2.45, 0, 1], [0.35, 3.05, -0.18, 0.78]]) {
        oval('streaming-body', [x - 0.22 * scale, y - 0.57 * scale, z - 0.06], [0.26 * scale, 0.81 * scale, 0.19 * scale], 'charcoal', [0, 0, -0.4]);
        for (let index = 0; index < 3; index++) {
          cone('streaming-wisp', [x - (0.3 + index * 0.12) * scale, y - (0.65 + index * 0.13) * scale, z - 0.08 - index * 0.03], [0.16 * scale, (1.85 + index * 0.12) * scale, 0.13 * scale], 'charcoal', [0, 0, 2.53 + index * 0.13]);
        }
        const head = oval('ghost-head', [x, y, z], [0.35 * scale, 0.44 * scale, 0.26 * scale], 'charcoal');
        oval('skeletal-face', [x, y - 0.02 * scale, z + 0.22 * scale], [0.23 * scale, 0.3 * scale, 0.1 * scale], 'parchment');
        for (const side of [-1, 1]) {
          oval('hollow-eye', [x + side * 0.1 * scale, y + 0.055 * scale, z + 0.312 * scale], [0.079 * scale, 0.09 * scale, 0.026 * scale], 'shadow', [0, 0, side * 0.18]);
          oval('pale-eye', [x + side * 0.1 * scale, y + 0.06 * scale, z + 0.34 * scale], [0.023 * scale, 0.027 * scale, 0.012 * scale], 'pale');
          oval('skull-cheek', [x + side * 0.16 * scale, y - 0.1 * scale, z + 0.28 * scale], [0.085 * scale, 0.06 * scale, 0.055 * scale], 'parchment', [0, 0, -side * 0.25]);
        }
        cone('nasal-cavity', [x, y - 0.07 * scale, z + 0.327 * scale], [0.047 * scale, 0.115 * scale, 0.018 * scale], 'shadow', [0, 0, Math.PI]);
        oval('skull-jaw', [x, y - 0.24 * scale, z + 0.24 * scale], [0.17 * scale, 0.095 * scale, 0.085 * scale], 'parchment');
        oval('ghost-mouth', [x, y - 0.195 * scale, z + 0.32 * scale], [0.128 * scale, 0.055 * scale, 0.025 * scale], 'shadow');
        for (const tooth of [-1.5, -0.5, 0.5, 1.5]) part('skull-tooth', 'box', [x + tooth * 0.052 * scale, y - 0.176 * scale, z + 0.347 * scale], [0.035 * scale, 0.045 * scale, 0.018 * scale], 'pale');
        motion(head, 'z', 0.04, 1.2, x);
      }
      path('net-bearing-arm', [[-0.43, 2.16, 0.12], [-0.04, 1.97, 0.24], [0.25, 1.95, 0.38]], 0.045, 'charcoal');
      // A loosely hanging woven net stays legible from the shared front camera.
      path('net-rim', [[0.25, 1.95, 0.38], [1.35, 2.05, 0.38], [1.22, 0.65, 0.4], [0.38, 0.55, 0.4], [0.25, 1.95, 0.38]], 0.028, 'gold');
      for (let index = 1; index <= 4; index++) {
        const ratio = index / 5;
        bone('net-strand-vertical', [0.25 + ratio * 1.1, 1.95 + ratio * 0.1, 0.39], [0.38 + ratio * 0.84, 0.55 + ratio * 0.1, 0.41], 0.012, 'gold');
        bone('net-strand-crossing', [0.25 + ratio * 0.13, 1.95 - ratio * 1.4, 0.4], [1.35 - ratio * 0.13, 2.05 - ratio * 1.4, 0.4], 0.012, 'gold');
      }
      break;
    }
    case 'amomongo': {
      oval('ape-torso', [0, 1.65, 0], [0.62, 0.78, 0.47], 'fur');
      oval('ape-chest', [0, 1.75, 0.32], [0.42, 0.55, 0.17], 'brown');
      oval('ape-head', [0, 2.65, 0.08], [0.46, 0.5, 0.38], 'fur');
      oval('ape-muzzle', [0, 2.48, 0.4], [0.3, 0.22, 0.2], 'brown');
      oval('ape-nose', [0, 2.54, 0.6], [0.11, 0.07, 0.055], 'shadow');
      oval('ape-mouth', [0, 2.36, 0.55], [0.16, 0.065, 0.04], 'shadow');
      for (const x of [-0.18, 0, 0.18]) cone('crown-fur', [x, 3.08, 0.02], [0.13, 0.32, 0.14], 'charcoal', [0, 0, -x]);
      for (const side of [-1, 1]) {
        oval('ape-eye-socket', [side * 0.17, 2.72, 0.4], [0.12, 0.1, 0.04], 'shadow');
        bone('heavy-brow', [side * 0.06, 2.86, 0.41], [side * 0.29, 2.81, 0.4], 0.05, 'charcoal');
        cone('ape-fang', [side * 0.1, 2.37, 0.6], [0.035, 0.18, 0.035], 'pale', [0, 0, Math.PI]);
      }
      eyes([0, 2.72, 0.43], 0.17, 0.06);
      for (const side of [-1, 1]) {
        path('long-arm', [[side * 0.5, 2.05, 0], [side * 1, 1.3, 0.1], [side * 1.3, 0.55, 0.45]], 0.23, 'fur');
        oval('ape-hand', [side * 1.3, 0.5, 0.5], [0.23, 0.18, 0.25], 'brown');
        claws([side * 1.3, 0.48, 0.78]);
        path('bent-leg', [[side * 0.3, 1.2, 0], [side * 0.5, 0.7, 0.25], [side * 0.4, 0.2, 0.45]], 0.23, 'fur');
        oval('ape-foot', [side * 0.4, 0.17, 0.55], [0.25, 0.13, 0.35], 'brown');
        cone('shaggy-shoulder', [side * 0.55, 2.1, 0], [0.2, 0.45, 0.25], 'fur', [0, 0, side * 0.45]);
        for (let lock = 0; lock < 3; lock++) cone('arm-fur', [side * (0.63 + lock * 0.12), 1.95 - lock * 0.32, 0.2], [0.14, 0.5, 0.15], 'charcoal', [0, 0, side * 0.5]);
        for (let finger = 0; finger < 3; finger++) {
          const x = side * (1.19 + finger * 0.075);
          path('hooked-finger', [[x, 0.47, 0.65], [x, 0.25, 0.82], [x - side * 0.025, 0.31, 0.99]], 0.035, 'brown');
        }
      }
      break;
    }
    case 'borak': {
      oval('horse-body', [0, 1.3, 0], [0.52, 0.55, 0.85], 'pale');
      for (const side of [-1, 1]) for (const z of [-0.52, 0.55]) {
        bone('horse-leg', [side * 0.36, 1.08, z], [side * 0.4, 0.25, z + 0.1], 0.12, 'parchment');
        oval('hoof', [side * 0.4, 0.18, z + 0.15], [0.16, 0.13, 0.22], 'charcoal');
        oval('feathered-fetlock', [side * 0.4, 0.36, z + 0.12], [0.15, 0.15, 0.15], 'pale');
      }
      bone('horse-neck', [0, 1.45, 0.52], [0, 2.45, 0.73], 0.28, 'parchment');
      oval('mane', [0, 2.22, 0.5], [0.33, 0.65, 0.25], 'charcoal');
      humanHead([0, 2.65, 0.85], 1, false).name = 'human-face';
      oval('human-nose', [0, 2.65, 1.13], [0.055, 0.1, 0.045], 'parchment');
      oval('human-mouth', [0, 2.5, 1.095], [0.09, 0.025, 0.02], 'brown');
      for (const side of [-1, 1]) {
        cone('flowing-mane', [side * 0.22, 2.34, 0.63], [0.13, 0.9, 0.15], 'charcoal', [0, 0, side * 0.18]);
        oval('shoulder-harness', [side * 0.4, 1.78, 0.43], [0.075, 0.32, 0.08], 'gold', [0, 0, -side * 0.35]);
      }
      wings([0.3, 1.7, -0.15], 0.86, 'pale');
      for (const pivot of rig.children) {
        const wing = pivot.children.find((child) => child.name === 'left-wing' || child.name === 'right-wing');
        if (!wing) continue;
        const side = wing.name === 'left-wing' ? -1 : 1;
        for (let feather = 0; feather < 5; feather++) {
          part('flight-feather', 'sphere', [side * (0.42 + feather * 0.13), 0.25 + feather * 0.06, 0.035], [0.105, 0.55, 0.045], feather % 2 ? 'parchment' : 'pale', [0, 0, -side * (0.55 + feather * 0.15)], pivot);
        }
      }
      path('horse-tail', [[0, 1.55, -0.7], [0.25, 1.2, -1.1], [0.2, 0.8, -1.4]], 0.12, 'charcoal');
      for (const side of [-1, 0, 1]) cone('tail-plume', [0.2 + side * 0.08, 0.82, -1.35], [0.09, 0.6, 0.12], 'charcoal', [-0.3, 0, side * 0.2]);
      break;
    }
    case 'buyagan': {
      // A buyagan is a person feared for harmful words/compliments, not a
      // separate fanged species. Hair and garments are an illustrative choice.
      cone('long-skirt', [0, 0.65, 0], [0.48, 1.12, 0.35], 'brown');
      oval('human-torso', [0, 1.65, 0], [0.36, 0.6, 0.25], 'brown');
      oval('long-hair', [0, 2.43, -0.06], [0.46, 0.77, 0.32], 'charcoal');
      oval('gaunt-face', [0, 2.56, 0.21], [0.3, 0.44, 0.22], 'parchment');
      oval('human-chin', [0, 2.26, 0.3], [0.18, 0.15, 0.12], 'parchment');
      oval('human-nose', [0, 2.56, 0.45], [0.055, 0.135, 0.075], 'parchment');
      for (const side of [-1, 1]) {
        oval('human-eye-socket', [side * 0.12, 2.68, 0.405], [0.115, 0.135, 0.035], 'fur', [0, 0, -side * 0.15]);
        oval('wide-eye', [side * 0.12, 2.68, 0.442], [0.085, 0.09, 0.025], 'pale');
        oval('human-pupil', [side * 0.12, 2.68, 0.47], [0.031, 0.046, 0.015], 'charcoal');
        oval('hollow-cheek', [side * 0.195, 2.48, 0.38], [0.055, 0.12, 0.025], 'fur', [0, 0, -side * 0.35]);
        bone('worried-brow', [side * 0.06, 2.86, 0.41], [side * 0.21, 2.82, 0.39], 0.021, 'charcoal');
        for (let index = 0; index < 3; index++) cone('hair-lock', [side * (0.31 + index * 0.07), 2.02 - index * 0.15, 0.16 - index * 0.08], [0.105, 1.5 + index * 0.12, 0.12], 'charcoal', [0, 0, Math.PI + side * 0.035]);
        bone('cloth-sash', [side * 0.25, 2.02, 0.17], [side * 0.15, 1.15, 0.27], 0.09, 'gold');
        oval('shoe', [side * 0.2, 0.13, 0.13], [0.16, 0.09, 0.24], 'charcoal');
      }
      path('resting-arm', [[-0.3, 1.95, 0], [-0.53, 1.5, 0.1], [-0.48, 1.05, 0.28]], 0.09, 'brown');
      oval('resting-hand', [-0.48, 1.02, 0.3], [0.09, 0.15, 0.08], 'parchment');
      path('raised-arm', [[0.3, 1.95, 0], [0.63, 1.7, 0.2], [0.8, 2.12, 0.35]], 0.085, 'brown');
      oval('speaking-hand', [0.82, 2.22, 0.35], [0.09, 0.16, 0.07], 'parchment', [0, 0, -0.2]);
      for (let finger = 0; finger < 4; finger++) bone('raised-finger', [0.76 + finger * 0.04, 2.29, 0.37], [0.75 + finger * 0.045, 2.47 - Math.abs(finger - 1.5) * 0.035, 0.38], 0.018, 'parchment');
      oval('open-mouth', [0.02, 2.36, 0.44], [0.12, 0.105, 0.028], 'shadow');
      oval('lower-lip', [0.02, 2.265, 0.432], [0.125, 0.028, 0.028], 'fur');
      for (const tooth of [-1.5, -0.5, 0.5, 1.5]) part('human-tooth', 'box', [0.02 + tooth * 0.042, 2.415, 0.473], [0.034, 0.026, 0.016], 'pale');
      for (const [index, x] of [0.5, 0.82, 1.16].entries()) {
        path('spoken-curse', [[x, 2.48 + index * 0.025, 0.4], [x + 0.1, 2.37, 0.42], [x, 2.26 - index * 0.025, 0.4]], 0.018, 'gold');
      }
      break;
    }
    case 'duwende': {
      oval('seated-body', [0, 0.72, 0], [0.62, 0.6, 0.5], 'brown');
      oval('gnome-head', [0, 1.6, 0.05], [0.48, 0.48, 0.4], 'parchment');
      oval('hat-brim', [0, 2.03, 0.03], [0.65, 0.08, 0.48], 'leaf');
      cone('pointed-hat', [0.06, 2.5, 0.02], [0.57, 1.02, 0.45], 'leaf', [0, 0, -0.12]);
      part('hat-band', 'cylinder', [0, 2.08, 0.03], [0.55, 0.11, 0.43], 'gold');
      cone('crooked-hat-tip', [0.15, 2.99, 0.02], [0.15, 0.4, 0.14], 'leaf', [0, 0, -0.55]);
      cone('folded-hat-tip', [0.29, 3.12, 0.02], [0.085, 0.26, 0.09], 'leaf', [0, 0, -0.95]);
      oval('long-nose', [0, 1.55, 0.55], [0.13, 0.14, 0.35], 'parchment');
      cone('beard', [0, 1.14, 0.42], [0.34, 0.68, 0.2], 'pale', [0, 0, Math.PI]);
      eyes([0, 1.7, 0.4], 0.19, 0.04);
      for (const side of [-1, 1]) {
        cone('pointed-ear', [side * 0.5, 1.73, 0.03], [0.13, 0.43, 0.12], 'parchment', [0, 0, -side * Math.PI / 2]);
        bone('gnome-brow', [side * 0.1, 1.86, 0.42], [side * 0.3, 1.81, 0.36], 0.035, 'pale');
        oval('moustache', [side * 0.16, 1.41, 0.5], [0.18, 0.055, 0.08], 'pale', [0, 0, -side * 0.22]);
        bone('arm', [side * 0.45, 1.02, 0], [side * 0.58, 0.5, 0.4], 0.15, 'brown');
        oval('gnome-hand', [side * 0.58, 0.48, 0.42], [0.13, 0.16, 0.1], 'parchment');
        for (let finger = 0; finger < 3; finger++) bone('gnome-finger', [side * (0.54 + finger * 0.04), 0.44, 0.48], [side * (0.55 + finger * 0.04), 0.25, 0.55], 0.02, 'parchment');
        oval('folded-knee', [side * 0.48, 0.4, 0.4], [0.28, 0.21, 0.25], 'brown');
        oval('folded-foot', [side * 0.5, 0.18, 0.45], [0.35, 0.15, 0.3], 'charcoal');
      }
      path('gnome-smile', [[-0.13, 1.34, 0.62], [0, 1.29, 0.65], [0.13, 1.34, 0.62]], 0.015, 'shadow');
      for (const x of [-0.18, 0, 0.18]) cone('beard-lock', [x, 1.04, 0.5], [0.1, 0.63, 0.09], 'pale', [0, 0, Math.PI - x]);
      break;
    }
    case 'janggu': {
      oval('beast-body', [0, 1.4, 0], [0.62, 0.72, 0.5], 'fur');
      oval('broad-face', [0, 2.35, 0.15], [0.47, 0.5, 0.4], 'brown');
      oval('muzzle', [0, 2.18, 0.5], [0.32, 0.2, 0.16], 'parchment');
      oval('beast-nose', [0, 2.25, 0.66], [0.12, 0.075, 0.075], 'shadow');
      oval('beast-mouth', [0, 2.08, 0.625], [0.19, 0.065, 0.04], 'shadow');
      eyes([0, 2.43, 0.5], 0.19, 0.055);
      for (const side of [-1, 1]) {
        cone('beast-ear', [side * 0.34, 2.83, 0.1], [0.15, 0.43, 0.16], 'fur', [0, 0, -side * 0.2]);
        cone('brow-horn', [side * 0.18, 2.85, 0.36], [0.075, 0.29, 0.075], 'brown', [-0.25, 0, -side * 0.3]);
        cone('beast-fang', [side * 0.12, 2.1, 0.69], [0.035, 0.16, 0.035], 'pale', [0, 0, Math.PI]);
        for (let lock = 0; lock < 4; lock++) cone('shaggy-mane', [side * (0.43 + lock * 0.035), 2.22 - lock * 0.18, 0.26], [0.2, 0.5, 0.15], 'charcoal', [0, 0, side * 0.48]);
        path('powerful-arm', [[side * 0.5, 1.85, 0], [side * 0.85, 1.05, 0.22], [side * 0.95, 0.4, 0.6]], 0.24, 'fur');
        oval('clawed-hand', [side * 0.95, 0.35, 0.65], [0.27, 0.18, 0.26], 'brown');
        claws([side * 0.95, 0.33, 0.93]);
        bone('haunch', [side * 0.4, 1.1, -0.1], [side * 0.5, 0.25, 0.22], 0.27, 'fur');
        oval('beast-foot', [side * 0.5, 0.18, 0.4], [0.25, 0.14, 0.4], 'brown');
        for (let toe = -1; toe <= 1; toe++) cone('foot-claw', [side * 0.5 + toe * 0.12, 0.15, 0.77], [0.045, 0.23, 0.045], 'pale', [Math.PI / 2, 0, 0]);
      }
      path('curved-tail', [[-0.45, 1.2, -0.3], [-1.05, 1.45, -0.6], [-1.35, 1.95, -0.6], [-0.95, 2.12, -0.55]], 0.13, 'fur');
      for (const offset of [-0.08, 0, 0.08]) cone('tail-tuft', [-0.98 + offset, 2.13, -0.55], [0.08, 0.38, 0.09], 'charcoal', [0, 0, -0.7]);
      break;
    }
    case 'magindara': {
      // The supplied mermaid has a long coiled fish body, webbed fin ears,
      // ragged dorsal fins and a small skull held beneath her human torso.
      const fin = new THREE.BufferGeometry();
      fin.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 0, 0, -0.48, 0.62, 0, -0.38, 0.05, 0, -0.62, -0.26, 0,
        -0.1, -0.12, 0, 0, -0.5, 0, 0.15, -0.12, 0, 0.5, -0.28, 0, 0.3, 0.12, 0, 0.42, 0.62, 0
      ], 3));
      fin.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 6, 0, 6, 7, 0, 7, 8, 0, 8, 9]);
      fin.computeVertexNormals(); geometries.set('mermaid-fin', fin);
      path('fish-tail', [[0, 1.7, -0.08], [-0.48, 1.15, -0.1], [-0.7, 0.57, 0], [-0.15, 0.34, 0.12], [0.6, 0.52, 0.05], [1.13, 1.02, 0]], 0.36, 'leaf');
      oval('tail-haunch', [-0.28, 1.3, -0.06], [0.42, 0.54, 0.33], 'leaf', [0, 0, -0.45]);
      part('tail-fin-left', 'mermaid-fin', [1.23, 1.2, 0], [0.78, 0.9, 1], 'leaf', [0, 0, -0.7]);
      part('tail-fin-right', 'mermaid-fin', [1.17, 1.1, -0.04], [0.55, 0.7, 1], 'gold', [0, 0, 1.5]);
      for (const [index, [x, y]] of [[-0.32, 1.65], [-0.65, 1.3], [-0.86, 0.91], [-0.8, 0.5], [-0.3, 0.22], [0.3, 0.29], [0.83, 0.56]].entries()) {
        cone('dorsal-fin', [x - 0.12, y + 0.05, -0.03], [0.14, 0.47, 0.07], 'gold', [0, 0, 0.6 + index * 0.37]);
        oval('fish-scale', [x + 0.1, y, 0.28], [0.12, 0.075, 0.028], 'gold', [0, 0, -0.35 + index * 0.16]);
      }
      oval('human-torso', [0, 2.13, 0], [0.32, 0.61, 0.25], 'parchment');
      oval('long-hair', [-0.08, 2.77, -0.17], [0.43, 0.69, 0.28], 'charcoal', [0, 0, -0.13]);
      oval('mermaid-face', [0, 3, 0.1], [0.26, 0.36, 0.23], 'parchment');
      oval('singing-mouth', [0.03, 2.87, 0.32], [0.07, 0.03, 0.015], 'shadow');
      oval('mermaid-nose', [0, 2.98, 0.34], [0.04, 0.07, 0.04], 'pale');
      for (const side of [-1, 1]) {
        part('fin-ear', 'mermaid-fin', [side * 0.3, 3.02, 0.01], [side * 0.4, 0.5, 1], 'leaf', [0, 0, -side * 0.7]);
        oval('mermaid-eye', [side * 0.1, 3.08, 0.31], [0.07, 0.027, 0.018], 'shadow', [0, 0, side * 0.15]);
        bone('cheek-mark', [side * 0.17, 3, 0.285], [side * 0.14, 2.9, 0.3], 0.012, 'leaf');
        path('arm', [[side * 0.27, 2.43, 0], [side * 0.5, 2.05, 0.15], [side * 0.33, 1.7, 0.5]], 0.075);
        oval('hand', [side * 0.29, 1.67, 0.53], [0.1, 0.13, 0.09], 'parchment');
        for (let lock = 0; lock < 2; lock++) cone('flowing-hair', [side * (0.3 + lock * 0.09) - 0.13, 2.45 - lock * 0.15, -0.12], [0.12, 1.2 + lock * 0.2, 0.1], 'charcoal', [0, 0, Math.PI - 0.25]);
        oval('skull-socket', [side * 0.08, 1.67, 0.84], [0.06, 0.07, 0.025], 'shadow');
      }
      oval('held-skull', [0, 1.61, 0.65], [0.22, 0.25, 0.2], 'pale');
      cone('skull-nose', [0, 1.58, 0.855], [0.035, 0.06, 0.02], 'shadow');
      bone('skull-jaw', [-0.13, 1.46, 0.8], [0.13, 1.46, 0.8], 0.045, 'parchment');
      break;
    }
    case 'manananggal': {
      oval('torso', [0, 2.05, 0.05], [0.34, 0.58, 0.25], 'parchment');
      oval('long-hair', [0, 2.87, -0.1], [0.42, 0.55, 0.3], 'charcoal');
      oval('vampire-face', [0, 2.96, 0.12], [0.27, 0.35, 0.25], 'parchment');
      oval('snarling-mouth', [0, 2.81, 0.35], [0.16, 0.13, 0.03], 'shadow');
      oval('sharp-nose', [0, 2.99, 0.38], [0.045, 0.09, 0.06], 'pale');
      eyes([0, 3.04, 0.34], 0.11, 0.035);
      wings([0.2, 2.15, -0.15], 1.18, 'fur');
      oval('separated-waist', [0, 1.53, 0.08], [0.3, 0.12, 0.24], 'red');
      path('entrails', [[-0.1, 1.48, 0.12], [-0.26, 1.1, 0.18], [0.1, 0.86, 0.2], [-0.18, 0.5, 0.27], [-0.02, 0.35, 0.3]], 0.058, 'red');
      path('entrails', [[0.1, 1.48, 0.12], [0.29, 1.15, 0.18], [0.03, 0.75, 0.28], [0.25, 0.55, 0.26]], 0.043, 'brown');
      for (const side of [-1, 1]) {
        cone('pointed-ear', [side * 0.27, 3.05, 0.05], [0.1, 0.27, 0.1], 'parchment', [0, 0, -side * 0.85]);
        cone('fang', [side * 0.095, 2.84, 0.395], [0.035, 0.14, 0.025], 'pale', [0, 0, Math.PI]);
        bone('angry-brow', [side * 0.04, 3.13, 0.34], [side * 0.2, 3.17, 0.29], 0.028, 'charcoal');
        cone('windblown-hair', [side * 0.37, 2.98, -0.08], [0.15, 0.95, 0.12], 'charcoal', [0, 0, -side * 0.95]);
        path('wing-leading-edge', [[side * 0.2, 2.16, -0.1], [side * 0.85, 2.98, -0.12], [side * 1.78, 3.15, -0.13]], 0.035, 'brown');
        for (const [x, y] of [[1.59, 1.86], [1.24, 2.14], [0.94, 1.65]]) bone('wing-finger', [side * 0.85, 2.98, -0.1], [side * x, y, -0.1], 0.018, 'brown');
        path('reaching-arm', [[side * 0.27, 2.33, 0.13], [side * 0.66, 2.17, 0.34], [side * 1.02, 2.47, 0.48]], 0.075);
        oval('clawed-hand', [side * 1.07, 2.5, 0.5], [0.14, 0.1, 0.1], 'parchment', [0, 0, side * 0.25]);
        for (let finger = 0; finger < 3; finger++) {
          path('clawed-finger', [[side * (1.12 + finger * 0.04), 2.54 - finger * 0.06, 0.51], [side * (1.33 + finger * 0.04), 2.57 - finger * 0.09, 0.52], [side * (1.39 + finger * 0.04), 2.43 - finger * 0.08, 0.55]], 0.025, 'charcoal');
        }
        bone('rib', [side * 0.08, 2.08, 0.28], [side * 0.27, 2.15, 0.2], 0.015, 'brown');
      }
      // Keep the new wing skeleton in the membrane's animated local frame.
      for (const mesh of rig.children.filter((child) => child.name.startsWith('wing-leading-edge') || child.name === 'wing-finger')) {
        const name = mesh.position.x < 0 ? 'left-wing' : 'right-wing';
        const pivot = rig.children.find((child) => child.children.some((part) => part.name === name));
        mesh.position.x -= pivot.position.x;
        mesh.position.y -= pivot.position.y;
        mesh.position.z -= pivot.position.z;
        pivot.add(mesh);
      }
      break;
    }
    case 'mangyan_nature_spirit': {
      oval('seated-body', [0, 1.2, 0], [0.44, 0.55, 0.3], 'brown');
      oval('long-hair', [0, 1.95, -0.1], [0.44, 0.73, 0.3], 'charcoal');
      humanHead([0, 2.1, 0.12], 0.9, false);
      antlers([0, 2.43, 0], 1.1, 1.03);
      oval('spirit-nose', [0, 2.09, 0.37], [0.04, 0.065, 0.045], 'parchment');
      oval('spirit-mouth', [0, 1.97, 0.33], [0.075, 0.02, 0.02], 'brown');
      for (let bead = -2; bead <= 2; bead++) oval('woodland-bead', [bead * 0.1, 1.68 + Math.abs(bead) * 0.035, 0.3], [0.04, 0.055, 0.035], 'gold');
      for (const side of [-1, 1]) {
        cone('leaf-ear', [side * 0.34, 2.23, 0.13], [0.13, 0.45, 0.09], 'parchment', [0, 0, -side * 1.1]);
        path('antler-crown', [[side * 0.55, 2.98, -0.12], [side * 0.85, 3.2, -0.16], [side * 1.13, 3.31, -0.1]], 0.022, 'brown');
        bone('antler-crown-tip', [side * 0.85, 3.2, -0.16], [side * 0.81, 3.46, -0.11], 0.017, 'brown');
        oval('cheek-mark', [side * 0.14, 2.02, 0.325], [0.025, 0.085, 0.017], 'leaf', [0, 0, side * 0.25]);
        for (let lock = 0; lock < 2; lock++) cone('long-hair-lock', [side * (0.3 + lock * 0.09), 1.59, 0.14 - lock * 0.1], [0.09, 1.5, 0.1], 'charcoal', [0, 0, Math.PI + side * 0.1]);
        oval('folded-leg', [side * 0.4, 0.35, 0.2], [0.55, 0.2, 0.3], 'parchment', [0, 0, side * 0.18]);
        path('resting-arm', [[side * 0.3, 1.42, 0], [side * 0.55, 0.9, 0.2], [side * 0.3, 0.5, 0.5]], 0.08);
        path('twig-frame', [[side * 0.9, 0.2, -0.1], [side * 1.2, 1.05, -0.2], [side * 1.05, 1.9, -0.2]], 0.03, 'brown');
        for (const y of [0.7, 1.2, 1.65]) oval('leaf', [side * 1.1, y, -0.17], [0.14, 0.28, 0.06], 'leaf', [0, 0, side * 0.5]);
        path('trailing-root', [[side * 0.27, 0.27, 0.35], [side * 0.83, 0.16, 0.55], [side * 1.15, 0.21, 0.28]], 0.035, 'brown');
      }
      break;
    }
    case 'mumu': {
      // Mumu is a variable ghost/boogeyman, without one fixed regional anatomy.
      // Keep this banner's looming long-haired apparition and exposed face.
      // A shaped cloth surface gives the robe shoulders and a waist instead of
      // a pointed cone, with alternating low hem points for its ragged drape.
      const cloth = new THREE.BufferGeometry(), vertices = [], indices = [];
      const rings = [[0.2, 0.6, 0.34], [0.55, 0.59, 0.33], [1.2, 0.36, 0.25], [1.85, 0.46, 0.25], [2.05, 0.5, 0.25], [2.18, 0.22, 0.17]];
      for (const [ring, [y, width, depth]] of rings.entries()) {
        for (let segment = 0; segment < 8; segment++) {
          const angle = segment * Math.PI / 4;
          vertices.push(Math.sin(angle) * width, y + (ring === 0 && segment % 2 ? 0.11 : 0), Math.cos(angle) * depth);
          if (ring > 0) {
            const current = ring * 8 + segment, next = ring * 8 + (segment + 1) % 8;
            indices.push(current - 8, next - 8, current, next - 8, next, current);
          }
        }
      }
      cloth.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      cloth.setIndex(indices); cloth.computeVertexNormals();
      geometries.set('apparition-cloth', cloth);
      part('white-robe', 'apparition-cloth', [0, 0, 0], [1, 1, 1], 'parchment');
      oval('apparition-neck', [0, 2.3, 0.1], [0.11, 0.26, 0.12], 'pale');
      oval('face-hair', [0, 2.6, -0.08], [0.58, 0.94, 0.37], 'charcoal');
      oval('apparition-face', [0, 2.65, 0.32], [0.26, 0.4, 0.17], 'pale');
      oval('apparition-nose', [0, 2.6, 0.495], [0.045, 0.1, 0.05], 'parchment');
      oval('sunken-mouth', [0, 2.46, 0.48], [0.12, 0.04, 0.02], 'shadow', [0, 0, 0.08]);
      path('crooked-smile', [[-0.16, 2.51, 0.455], [-0.06, 2.46, 0.495], [0.08, 2.475, 0.495], [0.16, 2.53, 0.455]], 0.014, 'shadow');
      for (const side of [-1, 1]) {
        oval('apparition-socket', [side * 0.1, 2.72, 0.468], [0.105, 0.105, 0.025], 'fur', [0, 0, side * 0.2]);
        oval('apparition-sclera', [side * 0.1, 2.72, 0.497], [0.077, 0.061, 0.018], 'pale');
        oval('apparition-pupil', [side * 0.1, 2.72, 0.519], [0.025, 0.037, 0.012], 'shadow');
        bone('apparition-brow', [side * 0.055, 2.8, 0.476], [side * 0.19, 2.85, 0.433], 0.022, 'charcoal');
        oval('draped-shoulder', [side * 0.39, 2.02, 0], [0.26, 0.19, 0.24], 'parchment');
        cone('draped-sleeve', [side * 0.62, 1.42, 0], [0.25, 1.45, 0.23], 'parchment', [0, 0, side * 0.19]);
        oval('pale-hand', [side * 0.72, 0.67, 0.09], [0.065, 0.2, 0.065], 'pale');
        for (let index = 0; index < 3; index++) {
          cone('hanging-hair', [side * (0.32 + index * 0.11), 1.87 - index * 0.12, 0.23 - index * 0.1], [0.12, 2.12 + index * 0.14, 0.12], 'charcoal', [0, 0, Math.PI + side * 0.035]);
        }
        cone('ragged-hem', [side * 0.3, 0.43, 0.16], [0.14, 0.62, 0.17], 'pale', [0, 0, Math.PI]);
        path('robe-fold', [[side * 0.14, 1.84, 0.24], [side * 0.11, 1.16, 0.25], [side * 0.32, 0.29, 0.29]], 0.014, 'brown');
        bone('sleeve-fold', [side * 0.6, 1.75, 0.12], [side * 0.78, 0.86, 0.18], 0.012, 'brown');
      }
      cone('forehead-lock', [-0.05, 3.015, 0.405], [0.09, 0.45, 0.06], 'charcoal', [0, 0, Math.PI + 0.2]);
      break;
    }
    case 'sarimanok': {
      // A rooster-like bird with a swept crown and curling, separate plumes,
      // rather than the generic straight peacock fan of the early model.
      const plumeGeometry=new THREE.BufferGeometry(), plumeVertices=[], plumeIndices=[];
      const plumeCurve=[[0,0],[-0.4,0.6],[-0.95,0.8],[-1.32,0.55],[-1.48,0.1],[-1.3,-0.45]];
      for (const [index, [x,y]] of plumeCurve.entries()) {
        const a=plumeCurve[Math.max(0,index-1)], b=plumeCurve[Math.min(plumeCurve.length-1,index+1)];
        const dx=b[0]-a[0], dy=b[1]-a[1], length=Math.hypot(dx,dy);
        const width=[0.04,0.13,0.16,0.17,0.14,0.005][index];
        for(const side of [-1,1]) plumeVertices.push(x-side*dy/length*width,y+side*dx/length*width,0);
        if(index) { const n=index*2; plumeIndices.push(n-2,n-1,n,n-1,n+1,n); }
      }
      plumeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(plumeVertices,3));
      plumeGeometry.setIndex(plumeIndices); plumeGeometry.computeVertexNormals(); geometries.set('curled-feather',plumeGeometry);
      oval('bird-body', [0, 1.45, 0], [0.5, 0.64, 0.56], 'gold', [-0.15, 0, -0.1]);
      oval('bird-breast', [0.05, 1.68, 0.35], [0.36, 0.57, 0.27], 'parchment');
      oval('bird-neck', [0.13, 2.12, 0.28], [0.25, 0.55, 0.25], 'gold');
      oval('bird-head', [0.18, 2.7, 0.35], [0.31, 0.32, 0.29], 'parchment');
      cone('beak', [0.24, 2.64, 0.79], [0.13, 0.48, 0.12], 'gold', [Math.PI / 2 + 0.15, 0, -0.15]);
      cone('beak-hook', [0.26, 2.57, 0.99], [0.07, 0.2, 0.065], 'brown', [0.2, 0, Math.PI]);
      oval('throat-wattle', [0.15, 2.35, 0.54], [0.11, 0.25, 0.09], 'red', [0, 0, -0.2]);
      for (let index = 0; index < 4; index++) {
        const x = -0.06 + index * 0.13, peak = 3.28 + index * 0.08;
        path('crest', [[x, 2.96, 0.2], [x - 0.15, peak, 0.13], [x - 0.43, peak + 0.14, 0.12], [x - 0.5, peak - 0.04, 0.14]], 0.075 - index * 0.007, index % 2 ? 'gold' : 'brown');
      }
      for (let index = 0; index < 5; index++) {
        const scale=0.78+index*0.05;
        const plume=part('tail-plume', 'curled-feather', [-0.19, 1.33+index*0.13, -0.37-index*0.025], [scale,scale,1], index % 2 ? 'leaf' : 'gold', [0,0,(index-2)*0.06]);
        motion(plume, 'z', 0.025, 1.3, (index - 2) * 0.3);
      }
      for (const side of [-1, 1]) {
        oval('bird-eye', [0.18 + side * 0.19, 2.77, 0.57], [0.055, 0.05, 0.025], 'shadow');
        oval('eye-glint', [0.17 + side * 0.19, 2.785, 0.597], [0.014, 0.014, 0.008], 'pale');
        oval('bird-wing', [side * 0.42, 1.58, 0.15], [0.2, 0.47, 0.31], 'leaf', [0, 0, side * 0.25]);
        for (let feather = 0; feather < 3; feather++) cone('flight-feather', [side * (0.35 + feather * 0.09), 1.35 - feather * 0.03, 0.35], [0.1, 0.63, 0.07], feather % 2 ? 'gold' : 'parchment', [0, 0, Math.PI + side * (0.15 + feather * 0.12)]);
        path('bird-leg', [[side * 0.18, 1.03, 0.05], [side * 0.23, 0.61, 0.05], [side * 0.2, 0.34, 0.18]], 0.055, 'brown');
        for (let toe = -1; toe <= 1; toe++) path('bird-toe', [[side * 0.2, 0.35, 0.18], [side * 0.2 + toe * 0.12, 0.32, 0.42], [side * 0.2 + toe * 0.14, 0.23, 0.5]], 0.025, 'charcoal');
      }
      bone('perch', [-0.85, 0.17, 0.22], [0.85, 0.27, 0.22], 0.1, 'brown');
      bone('perch-twig', [0.5, 0.25, 0.22], [0.9, 0.6, 0.18], 0.04, 'brown');
      break;
    }
    case 'sigbin': {
      oval('hunched-back', [0, 1.38, -0.1], [0.63, 0.63, 0.7], 'fur');
      oval('raised-hindquarters', [0, 1.53, -0.5], [0.55, 0.6, 0.48], 'brown');
      const headTurn = new THREE.Group();
      headTurn.position.set(-0.26, 1.54, 0.55);
      headTurn.rotation.y = -1.9;
      rig.add(headTurn);
      part('backward-head', 'sphere', [0, 0, 0], [0.38, 0.35, 0.43], 'fur', [0, 0, 0], headTurn);
      part('long-muzzle', 'sphere', [0, -0.12, 0.34], [0.24, 0.18, 0.3], 'brown', [0, 0, 0], headTurn);
      eyes([0, 0.13, 0.38], 0.16, 0.045, headTurn);
      for (const side of [-1, 1]) {
        part('long-ear', 'cone', [side * 0.25, 0.68, -0.08], [0.13, 1.05, 0.14], 'fur', [0, 0, -side * 0.16], headTurn);
        part('inner-ear', 'cone', [side * 0.25, 0.69, 0.015], [0.065, 0.75, 0.035], 'parchment', [0, 0, -side * 0.16], headTurn);
        part('sigbin-fang', 'cone', [side * 0.1, -0.22, 0.57], [0.035, 0.15, 0.035], 'pale', [0, 0, Math.PI], headTurn);
        path('quadruped-leg', [[side * 0.4, 1.25, 0.42], [side * 0.53, 0.65, 0.5], [side * 0.45, 0.19, 0.7]], 0.12, 'fur');
        bone('hind-leg', [side * 0.35, 1.4, -0.55], [side * 0.4, 0.2, -0.5], 0.15, 'fur');
        oval('paw', [side * 0.45, 0.16, 0.72], [0.18, 0.11, 0.27], 'brown');
        oval('hind-paw', [side * 0.4, 0.16, -0.4], [0.18, 0.11, 0.25], 'brown');
        oval('reverse-hock', [side * 0.45, 0.6, 0.52], [0.15, 0.19, 0.15], 'brown');
        for (const digit of [-1, 1]) part('cloven-toe', 'box', [side * 0.45 + digit * 0.045, 0.11, 0.89], [0.07, 0.09, 0.13], 'charcoal');
      }
      part('sigbin-nose', 'sphere', [0, -0.09, 0.64], [0.1, 0.07, 0.055], 'shadow', [0, 0, 0], headTurn);
      part('sigbin-mouth', 'sphere', [0, -0.23, 0.56], [0.15, 0.055, 0.025], 'shadow', [0, 0, 0], headTurn);
      for (let lock = 0; lock < 5; lock++) cone('back-ridge', [0, 1.98 - lock * 0.035, -0.68 + lock * 0.23], [0.13, 0.4, 0.18], 'fur', [0.15, 0, 0]);
      path('thin-tail', [[0, 1.6, -0.9], [0.2, 1.55, -1.3], [0.2, 1.1, -1.6]], 0.06, 'fur');
      cone('tail-tuft', [0.2, 1.1, -1.6], [0.1, 0.3, 0.16], 'charcoal', [-0.3, 0, 0]);
      break;
    }
    case 'tambanokano': {
      // Mandaya crab version (Cole, 1916), matching the supplied banner.
      // Manobo spider/scorpion accounts are recorded separately in references.
      // A thick, bent finger encloses a real open pincer instead of a straight
      // fork. Both claws reuse it with opposing horizontal scales.
      const blade = new THREE.BufferGeometry(), vertices = [], indices = [];
      const outline = [[-0.08, 0], [0.09, 0], [0.23, 0.28], [0.15, 0.52], [-0.08, 0.68], [0.025, 0.38], [-0.035, 0.18]];
      for (const depth of [0.075, -0.075]) {
        vertices.push(0.04, 0.22, depth);
        for (const [x, y] of outline) vertices.push(x, y, depth);
      }
      for (let index = 1; index <= outline.length; index++) {
        const next = index % outline.length + 1;
        indices.push(0, index, next, 8, next + 8, index + 8, index, index + 8, next, next, index + 8, next + 8);
      }
      blade.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      blade.setIndex(indices); blade.computeVertexNormals();
      geometries.set('crab-pincer', blade);
      oval('shell', [0, 0.94, -0.12], [0.83, 0.37, 0.65], 'brown');
      oval('shell-ridge', [0, 1.15, -0.17], [0.57, 0.18, 0.47], 'fur');
      for (const x of [-0.36, 0, 0.36]) {
        cone('shell-spine-crown', [x, 1.39, -0.15], [0.095, 0.37, 0.11], 'fur', [0, 0, -x * 0.55]);
        oval('shell-plate', [x, 1.02, 0.45], [0.23, 0.18, 0.1], 'fur');
      }
      for (const side of [-1, 1]) {
        for (const [index, z] of [-0.67, -0.27, 0.12, 0.48].entries()) {
          path(`crab-leg-${side}-${index}`, [[side * 0.63, 0.96, z * 0.7], [side * (1.27 + index * 0.08), 1.25 - index * 0.14, z], [side * (1.66 - index * 0.04), 0.19, z * 1.7]], 0.085, 'brown');
          oval('leg-joint', [side * (1.27 + index * 0.08), 1.25 - index * 0.14, z], [0.095, 0.1, 0.095], 'fur');
          cone('pointed-foot', [side * (1.66 - index * 0.04), 0.23, z * 1.7], [0.055, 0.3, 0.065], 'charcoal', [0, 0, Math.PI - side * 0.35]);
          cone('shell-spine', [side * (0.7 - index * 0.035), 1.18, z * 0.8], [0.09, 0.36, 0.11], 'fur', [0, 0, -side * 0.65]);
        }
        const large = side < 0 ? 1 : 0.73;
        const x = side * 1.06, y = side < 0 ? 1.87 : 1.58;
        path('claw-arm', [[side * 0.55, 0.95, 0.43], [side * 0.99, 1.13, 0.72], [x, y - 0.15, 0.66]], 0.13, 'brown');
        oval(side < 0 ? 'left-claw' : 'right-claw', [x, y, 0.65], [0.3 * large, 0.42 * large, 0.23 * large], 'fur', [0, 0, -side * 0.2]);
        for (const pincer of [-1, 1]) {
          part('pincer-blade', 'crab-pincer', [x + pincer * 0.16 * large, y + 0.2 * large, 0.7], [pincer * large, large, large], 'brown');
          for (const offset of [0.39, 0.52]) cone('pincer-tooth', [x + pincer * 0.19 * large, y + offset * large, 0.78], [0.045 * large, 0.11 * large, 0.045 * large], 'parchment', [0, 0, pincer * Math.PI / 2]);
        }
        bone('eye-stalk', [side * 0.2, 1.02, 0.48], [side * 0.25, 1.32, 0.57], 0.035, 'charcoal');
        oval('crab-eye', [side * 0.25, 1.34, 0.61], [0.075, 0.075, 0.065], 'shadow');
        oval('eye-glint', [side * 0.25 - 0.015, 1.36, 0.67], [0.018, 0.018, 0.012], 'pale');
      }
      oval('moon', [0.22, 3.05, -0.4], [0.4, 0.4, 0.075], 'pale');
      for (const [x, y, size] of [[0.09, 3.15, 0.085], [0.36, 2.96, 0.06], [0.2, 2.86, 0.045]]) oval('moon-crater', [x, y, -0.325], [size, size * 0.8, 0.008], 'parchment');
      break;
    }
    case 'tarabusaw': {
      oval('giant-torso', [0, 1.93, 0], [0.55, 0.78, 0.35], 'brown');
      oval('broad-chest', [0, 2.27, 0.22], [0.5, 0.37, 0.2], 'parchment');
      oval('gaunt-abdomen', [0, 1.72, 0.21], [0.33, 0.47, 0.18], 'parchment');
      oval('shaggy-head', [0, 3.08, -0.1], [0.5, 0.56, 0.35], 'charcoal');
      oval('giant-head', [0, 3.03, 0.15], [0.34, 0.43, 0.29], 'parchment');
      oval('wide-nose', [0, 3.04, 0.45], [0.13, 0.13, 0.1], 'brown');
      oval('snarling-mouth', [0, 2.83, 0.41], [0.21, 0.17, 0.035], 'shadow');
      oval('heavy-jaw', [0, 2.66, 0.29], [0.24, 0.1, 0.18], 'parchment');
      cone('ragged-loincloth', [0, 1.25, 0.04], [0.42, 0.7, 0.3], 'fur');
      for (const side of [-1, 1]) {
        oval('deep-eye-socket', [side * 0.15, 3.15, 0.397], [0.1, 0.08, 0.035], 'fur', [0, 0, -side * 0.15]);
        oval('watchful-eye', [side * 0.15, 3.15, 0.432], [0.043, 0.026, 0.016], 'pale');
        bone('heavy-brow', [side * 0.05, 3.23, 0.42], [side * 0.27, 3.27, 0.32], 0.037, 'charcoal');
        cone('pointed-ear', [side * 0.4, 3.12, 0.04], [0.13, 0.35, 0.1], 'parchment', [0, 0, -side * 1.1]);
        for (let tooth = 0; tooth < 3; tooth++) cone('jagged-tooth', [side * (0.055 + tooth * 0.054), 2.9 - tooth * 0.012, 0.45], [0.025, tooth === 2 ? 0.14 : 0.09, 0.025], 'pale', [0, 0, Math.PI]);
        for (let lock = 0; lock < 3; lock++) cone('long-hair-lock', [side * (0.35 + lock * 0.1), 2.6 - lock * 0.15, -0.02], [0.14, 1.23 + lock * 0.17, 0.15], 'charcoal', [0, 0, Math.PI + side * 0.18]);
        oval('shoulder', [side * 0.52, 2.32, 0], [0.27, 0.35, 0.27], 'brown');
        path('long-arm', [[side * 0.53, 2.28, 0], [side * 0.92, 1.55, 0.1], [side * 1.17, 0.79, 0.35]], 0.16, 'brown');
        oval('large-hand', [side * 1.18, 0.66, 0.4], [0.2, 0.26, 0.17], 'parchment');
        for (let finger = 0; finger < 3; finger++) path('long-finger', [[side * (1.05 + finger * 0.12), 0.55, 0.46], [side * (1.08 + finger * 0.13), 0.22 + finger * 0.025, 0.54], [side * (0.99 + finger * 0.12), 0.17 + finger * 0.025, 0.65]], 0.04, 'brown');
        path('giant-leg', [[side * 0.3, 1.31, 0], [side * 0.43, 0.75, 0.11], [side * 0.35, 0.24, 0.35]], 0.19, 'brown');
        oval('giant-foot', [side * 0.35, 0.16, 0.47], [0.22, 0.12, 0.34], 'parchment');
        for (let rib = 0; rib < 3; rib++) bone('rib-line', [side * 0.13, 2.12 - rib * 0.18, 0.4], [side * (0.39 - rib * 0.04), 2.2 - rib * 0.18, 0.29], 0.014, 'fur');
      }
      break;
    }
    case 'tikbalang': {
      // Keep the banner's crouch and grasping human hands, but give the head
      // an unmistakable long horse skull and the body its gaunt rib cage.
      oval('human-torso', [0, 1.91, -0.05], [0.4, 0.61, 0.3], 'brown', [0.3, 0, 0]);
      oval('ribcage', [0, 2.03, 0.13], [0.35, 0.47, 0.22], 'parchment', [0.25, 0, 0]);
      bone('long-neck', [0, 2.2, 0.12], [0, 2.73, 0.4], 0.16, 'brown');
      oval('horse-head', [0, 2.9, 0.47], [0.29, 0.46, 0.32], 'parchment', [0.24, 0, 0]);
      oval('long-nasal-bone', [0, 2.69, 0.74], [0.2, 0.3, 0.25], 'parchment', [0.38, 0, 0]);
      oval('muzzle', [0, 2.54, 0.97], [0.26, 0.19, 0.24], 'brown');
      oval('lower-jaw', [0, 2.37, 0.87], [0.2, 0.1, 0.25], 'parchment');
      oval('mane', [0, 2.8, 0.08], [0.25, 0.56, 0.24], 'charcoal');
      path('horse-tail', [[0, 1.4, -0.25], [0.75, 1.2, -0.62], [1.12, 0.8, -0.72], [1.3, 0.55, -0.58]], 0.09, 'charcoal');
      for (let lock = 0; lock < 3; lock++) cone('tail-tassel', [1.21 + lock * 0.07, 0.53 - lock * 0.035, -0.58], [0.08, 0.6, 0.08], 'charcoal', [0, 0, 0.6]);
      for (const side of [-1, 1]) {
        cone(side < 0 ? 'left-ear' : 'right-ear', [side * 0.22, 3.4, 0.36], [0.12, 0.55, 0.11], 'brown', [0, 0, -side * 0.22]);
        cone('ear-inset', [side * 0.22, 3.4, 0.46], [0.055, 0.34, 0.025], 'charcoal', [0, 0, -side * 0.22]);
        oval('horse-eye-socket', [side * 0.2, 3.01, 0.69], [0.105, 0.11, 0.04], 'charcoal');
        oval('pale-horse-eye', [side * 0.2, 3.02, 0.733], [0.055, 0.035, 0.02], 'pale');
        oval('nostril', [side * 0.13, 2.58, 1.17], [0.045, 0.065, 0.025], 'shadow', [0, 0, side * 0.35]);
        bone('mouth-line', [side * 0.02, 2.44, 1.18], [side * 0.19, 2.45, 1.09], 0.018, 'shadow');
        for (let lock = 0; lock < 3; lock++) cone('mane-lock', [side * 0.24, 2.9 - lock * 0.26, 0.06 - lock * 0.08], [0.12, 0.62, 0.1], 'charcoal', [0, 0, Math.PI + side * 0.45]);
        for (let rib = 0; rib < 3; rib++) path('rib', [[side * 0.05, 2.25 - rib * 0.18, 0.35], [side * 0.25, 2.19 - rib * 0.18, 0.36], [side * 0.34, 2.27 - rib * 0.18, 0.22]], 0.024, 'brown');
        path('bent-human-leg', [[side * 0.28, 1.48, -0.08], [side * 0.73, 1.01, 0.3], [side * 0.55, 0.23, 0.65]], 0.155, 'brown');
        oval('bony-knee', [side * 0.73, 1.01, 0.3], [0.18, 0.2, 0.17], 'parchment');
        oval('hoof', [side * 0.55, 0.16, 0.78], [0.22, 0.12, 0.32], 'charcoal');
        path('long-human-arm', [[side * 0.34, 2.13, 0], [side * 0.86, 1.38, 0.37], [side * 0.73, 0.8, 0.85]], 0.09, 'brown');
        oval('human-hand', [side * 0.73, 0.73, 0.88], [0.16, 0.16, 0.11], 'parchment');
        for (let finger = 0; finger < 3; finger++) path('grasping-finger', [[side * (0.61 + finger * 0.12), 0.67, 0.94], [side * (0.58 + finger * 0.14), 0.42, 1.06], [side * (0.66 + finger * 0.13), 0.4, 1.2]], 0.028, 'charcoal');
      }
      break;
    }
    case 'tiyanak': {
      oval('baby-body', [0, 0.87, -0.04], [0.46, 0.4, 0.56], 'parchment');
      oval('rounded-belly', [0, 0.73, 0.27], [0.38, 0.33, 0.28], 'pale');
      oval('baby-head', [0, 1.43, 0.62], [0.5, 0.53, 0.42], 'parchment');
      oval('wild-hair-cap', [0, 1.78, 0.45], [0.49, 0.28, 0.36], 'charcoal');
      oval('fanged-mouth', [0, 1.23, 1.016], [0.23, 0.17, 0.04], 'shadow');
      oval('baby-jaw', [0, 1.04, 0.86], [0.25, 0.095, 0.2], 'parchment');
      oval('small-nose', [0, 1.47, 1.045], [0.08, 0.075, 0.075], 'brown');
      for (let wrinkle = 0; wrinkle < 2; wrinkle++) path('forehead-wrinkle', [[-0.22, 1.7 + wrinkle * 0.1, 0.94 - wrinkle * 0.06], [0, 1.75 + wrinkle * 0.08, 1 - wrinkle * 0.08], [0.22, 1.7 + wrinkle * 0.1, 0.94 - wrinkle * 0.06]], 0.012, 'brown');
      for (const side of [-1, 1]) {
        cone('pointed-ear', [side * 0.5, 1.56, 0.6], [0.14, 0.37, 0.12], 'parchment', [0, 0, -side * 1.0]);
        oval('sunken-eye', [side * 0.19, 1.57, 0.994], [0.13, 0.075, 0.035], 'fur', [0, 0, -side * 0.25]);
        oval('dark-infant-eye', [side * 0.19, 1.57, 1.03], [0.08, 0.05, 0.02], 'shadow');
        oval('eye-glint', [side * 0.19 - 0.02, 1.59, 1.051], [0.014, 0.014, 0.009], 'pale');
        bone('angry-brow', [side * 0.06, 1.65, 1.005], [side * 0.3, 1.72, 0.91], 0.025, 'brown');
        bone('cheek-wrinkle', [side * 0.12, 1.44, 1.04], [side * 0.3, 1.31, 0.94], 0.014, 'brown');
        for (let tooth = 0; tooth < 2; tooth++) cone('fang', [side * (0.07 + tooth * 0.09), 1.3, 1.063], [0.035, tooth ? 0.17 : 0.1, 0.025], 'pale', [0, 0, Math.PI]);
        path('crawling-arm', [[side * 0.33, 1.04, 0.3], [side * 0.69, 0.62, 0.58], [side * 0.7, 0.24, 0.96]], 0.105);
        oval('baby-hand', [side * 0.7, 0.2, 1.03], [0.18, 0.1, 0.18], 'parchment');
        for (let finger = -1; finger <= 1; finger++) {
          path('infant-finger', [[side * 0.7 + finger * 0.12, 0.22, 1.1], [side * 0.7 + finger * 0.14, 0.18, 1.32], [side * 0.7 + finger * 0.15, 0.12, 1.4]], 0.03, 'parchment');
          cone('claw', [side * 0.7 + finger * 0.15, 0.1, 1.44], [0.025, 0.16, 0.025], 'charcoal', [Math.PI / 2 + 0.4, 0, 0]);
        }
        path('crawling-leg', [[side * 0.3, 0.79, -0.34], [side * 0.63, 0.46, -0.57], [side * 0.48, 0.2, -0.77]], 0.15);
        oval('baby-foot', [side * 0.48, 0.15, -0.77], [0.19, 0.1, 0.22], 'parchment');
        for (let toe = -1; toe <= 1; toe++) cone('toe-claw', [side * 0.48 + toe * 0.1, 0.13, -0.99], [0.03, 0.18, 0.03], 'charcoal', [-Math.PI / 2, 0, 0]);
      }
      for (let lock = 0; lock < 7; lock++) {
        const x=(lock - 3) * 0.14;
        cone('hair-wisp', [x, 1.96 + (lock % 2) * 0.06, 0.52], [0.075, 0.5, 0.09], 'charcoal', [0.2, 0, -x * 1.8]);
      }
      break;
    }
    case 'white_deer': {
      oval('deer-body', [0, 0.63, -0.05], [0.65, 0.43, 0.82], 'pale');
      bone('deer-neck', [0, 0.85, 0.4], [0, 1.67, 0.6], 0.22, 'pale');
      oval('deer-head', [0, 1.94, 0.72], [0.25, 0.3, 0.35], 'pale');
      oval('deer-nose', [0, 1.87, 1.04], [0.17, 0.14, 0.16], 'parchment');
      oval('dark-nose', [0, 1.87, 1.18], [0.07, 0.045, 0.04], 'shadow');
      antlers([0, 2.15, 0.56], 1.2, 1.2);
      for (const side of [-1, 1]) {
        oval('deer-ear', [side * 0.3, 2.18, 0.58], [0.1, 0.26, 0.12], 'pale', [0, 0, -side * 0.65]);
        oval('inner-ear', [side * 0.3, 2.18, 0.67], [0.055, 0.18, 0.04], 'parchment', [0, 0, -side * 0.65]);
        oval('deer-eye', [side * 0.16, 2, 0.98], [0.035, 0.035, 0.02], 'shadow');
        path('antler-upper-fork', [[side * 0.66, 2.95, 0.46], [side * 1.03, 3.16, 0.4], [side * 1.35, 3.28, 0.45]], 0.021, 'brown');
        bone('antler-upper-tine', [side * 1.03, 3.16, 0.4], [side * 0.98, 3.43, 0.36], 0.016, 'brown');
        oval('folded-leg', [side * 0.38, 0.23, 0.35], [0.44, 0.13, 0.2], 'parchment');
        oval('folded-hoof', [side * 0.52, 0.2, 0.56], [0.18, 0.1, 0.15], 'brown');
        path('resting-foreleg', [[side * 0.26, 0.55, 0.5], [side * 0.5, 0.19, 0.8], [side * 0.28, 0.14, 1.21]], 0.065, 'pale');
        oval('front-hoof', [side * 0.28, 0.12, 1.3], [0.14, 0.08, 0.22], 'brown');
        for (let leaf = 0; leaf < 3; leaf++) oval('coat-leaf', [side * 0.61, 0.75, -0.42 + leaf * 0.26], [0.025, 0.1, 0.08], 'leaf', [leaf * 0.3, 0, 0]);
        oval('leaf', [side * 0.76, 0.18, -0.55], [0.14, 0.08, 0.34], 'leaf', [0, side * 0.65, 0]);
      }
      oval('deer-tail', [0, 0.72, -0.82], [0.16, 0.2, 0.28], 'pale', [-0.4, 0, 0]);
      break;
    }
  }

  const bounds = new THREE.Box3().setFromObject(group);
  group.userData = { creatureId: id, silhouette: SILHOUETTES[id], modelHeight: bounds.max.y - bounds.min.y, facing: '+z' };
  return {
    group,
    animate(time) {
      if (disposed) return;
      const t = Number.isFinite(time) ? time : 0;
      // Apply absolute local transforms so frame rate and repeated timestamps
      // cannot accumulate drift or move the scene-owned root placement.
      rig.position.y = 0.035 + Math.sin(t * 1.4) * 0.025;
      rig.rotation.y = Math.sin(t * 0.65) * 0.035;
      for (const pose of motions) pose.object.rotation[pose.axis] = pose.base + Math.sin(t * pose.speed + pose.phase) * pose.amplitude;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const value of new Set(geometries.values())) value.dispose();
      for (const value of new Set(materials.values())) value.dispose();
      geometries.clear(); materials.clear(); motions.length = 0;
      rig.clear(); group.clear();
      group.userData.disposed = true;
    }
  };
}

const GRID = 44;
const TERRAIN_SIZE = 160;
const smooth = (value) => value * value * (3 - 2 * value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const PALETTES = {
  forest: { ground: 0x65735a, light: 0x98a477, leaf: 0x38594b, sky: 0xb8c7bd, rock: 0x737a6c },
  hills:  { ground: 0x7a7e62, light: 0xb1ae7b, leaf: 0x466251, sky: 0xc3d1c7, rock: 0x7d8178 },
  garden: { ground: 0x74825a, light: 0xb1b57d, leaf: 0x49734c, sky: 0xc6d2bd, rock: 0x8e8d74 },
  night:  { ground: 0x566552, light: 0x8e9570, leaf: 0x354e44, sky: 0xa4b5b6, rock: 0x6b756c },
  coast:  { ground: 0xb9b28b, light: 0xd7cfab, leaf: 0x557e62, sky: 0xc4d4ce, rock: 0x899086 }
};

export function habitatOf(data) {
  const text = (data.habitat || '').toLowerCase();
  if (data.type === 'sea' || /coast|waters|\bseas\b/.test(text)) return 'coast';
  if (/mountain|hills/.test(text)) return 'hills';
  if (/garden|earth mound|old trees/.test(text)) return 'garden';
  if (/dark|quiet|old houses/.test(text)) return 'night';
  return 'forest';
}

function randomFor(text) {
  let seed = 2166136261;
  for (let i = 0; i < text.length; i++) seed = Math.imul(seed ^ text.charCodeAt(i), 16777619);
  return () => {
    seed += 0x6D2B79F5;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function groundHeight(x, z, habitat) {
  const clearing = smooth(clamp((Math.hypot(x, z) - 7) / 16, 0, 1));
  const amplitude = habitat === 'hills' ? 2.6 : 1.1;
  const hills = (Math.sin(x * 0.105) * Math.cos(z * 0.087) + Math.sin((x + z) * 0.049) * 0.5) * amplitude * clearing;
  return hills - (habitat === 'coast' ? smooth(clamp((-z - 2) / 12, 0, 1)) * 2 : 0);
}

export function makeEnvironment() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 240);
  const hemisphere = new THREE.HemisphereLight(0xe8eee0, 0x4a5140, 2.25);
  const sunlight = new THREE.DirectionalLight(0xffe3b7, 2.6);
  sunlight.position.set(-14, 22, 12);
  scene.add(hemisphere, sunlight);

  // One indexed grid: 3,872 triangles, updated in place when the habitat changes.
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array((GRID + 1) * (GRID + 1) * 3);
  const colors = new Float32Array(vertices.length);
  const indices = new Uint16Array(GRID * GRID * 6);
  let index = 0;
  for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
    const a = z * (GRID + 1) + x, b = a + GRID + 1;
    indices[index++] = a; indices[index++] = b; indices[index++] = a + 1;
    indices[index++] = a + 1; indices[index++] = b; indices[index++] = b + 1;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  terrain.userData.role = 'encounter-terrain';
  scene.add(terrain);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(160, 96), new THREE.MeshStandardMaterial({ color: 0x659c9c, roughness: 0.35, metalness: 0.08 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.22, -50);
  water.visible = false;
  scene.add(water);

  // Five instanced batches, 126 total instances. No shadows or postprocessing.
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.23, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0x695b46, roughness: 1 }), 24);
  const canopy = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7),
    new THREE.MeshStandardMaterial({ color: 0x38594b, roughness: 1, flatShading: true }), 24);
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x737a6c, roughness: 1, flatShading: true }), 24);
  const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.3, 0.8, 3),
    new THREE.MeshStandardMaterial({ color: 0x98a477, roughness: 1, flatShading: true }), 44);
  const ridges = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7),
    new THREE.MeshStandardMaterial({ color: 0x65735a, roughness: 1, flatShading: true }), 10);
  scene.add(trunk, canopy, rocks, grass, ridges);

  // A small opaque contact patch anchors the feet without a shadow-map pass.
  const contact = new THREE.Mesh(new THREE.CircleGeometry(1.15, 24),
    new THREE.MeshBasicMaterial({ color: 0x526047, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.012;
  contact.scale.set(1.5, 0.7, 1);
  scene.add(contact);
  return { scene, camera, terrain, water, contact, trunk, canopy, rocks, grass, ridges, habitat: null };
}

export function setHabitat(resources, habitat) {
  if (resources.habitat === habitat) return;
  resources.habitat = habitat;
  const palette = PALETTES[habitat];
  const random = randomFor(habitat);
  const dark = new THREE.Color(palette.ground), light = new THREE.Color(palette.light);
  resources.scene.background = new THREE.Color(palette.sky);
  resources.scene.fog = new THREE.Fog(palette.sky, 42, 135);
  resources.water.visible = habitat === 'coast';
  resources.canopy.material.color.set(palette.leaf);
  resources.grass.material.color.set(palette.light);
  resources.rocks.material.color.set(palette.rock);
  resources.ridges.material.color.set(palette.ground);
  resources.contact.material.color.set(palette.ground);
  const positions = resources.terrain.geometry.attributes.position;
  const colors = resources.terrain.geometry.attributes.color;
  const shade = new THREE.Color();
  for (let z = 0; z <= GRID; z++) for (let x = 0; x <= GRID; x++) {
    const offset = (z * (GRID + 1) + x) * 3;
    const px = (x / GRID - 0.5) * TERRAIN_SIZE, pz = (z / GRID - 0.5) * TERRAIN_SIZE;
    positions.array[offset] = px;
    positions.array[offset + 1] = groundHeight(px, pz, habitat);
    positions.array[offset + 2] = pz;
    shade.r = dark.r; shade.g = dark.g; shade.b = dark.b;
    shade.lerp(light, 0.15 + random() * 0.5);
    colors.array[offset] = shade.r; colors.array[offset + 1] = shade.g; colors.array[offset + 2] = shade.b;
  }
  positions.needsUpdate = colors.needsUpdate = true;
  resources.terrain.geometry.computeVertexNormals();
  resources.terrain.geometry.computeBoundingSphere();

  const dummy = new THREE.Object3D();
  const place = (mesh, i, x, y, z, sx, sy, sz, yaw = 0) => {
    dummy.position.set(x, y, z);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(0, yaw, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };
  const clearingPoint = () => {
    // A clear central corridor keeps the creature visible from the ground camera.
    const side = random() > 0.5 ? 1 : -1;
    return { x: side * (6 + random() * 33), z: habitat === 'coast' ? 1 + random() * 32 : -34 + random() * 66 };
  };
  for (let i = 0; i < 24; i++) {
    const p = clearingPoint(), height = 3.7 + random() * 3.5;
    const y = groundHeight(p.x, p.z, habitat);
    const trunkHeight = height * 0.48;
    place(resources.trunk, i, p.x, y + trunkHeight / 2, p.z, 1, trunkHeight, 1);
    place(resources.canopy, i, p.x, y + height * 0.65, p.z, height * 0.34, height * 0.8, height * 0.34, random() * Math.PI);
    const rock = clearingPoint(), size = 0.35 + random() * 0.75;
    place(resources.rocks, i, rock.x, groundHeight(rock.x, rock.z, habitat) + size * 0.34, rock.z,
      size, size * 0.7, size * 1.2, random() * Math.PI);
  }
  for (let i = 0; i < 44; i++) {
    const p = clearingPoint(), scale = 0.55 + random() * 1.3;
    place(resources.grass, i, p.x, groundHeight(p.x, p.z, habitat) + 0.4 * scale, p.z, scale, scale, scale, random() * Math.PI);
  }
  for (let i = 0; i < 10; i++) {
    const x = -75 + i * 16, z = -54 - random() * 17;
    const height = 7 + random() * (habitat === 'hills' ? 15 : 8);
    place(resources.ridges, i, x, groundHeight(x, z, habitat) + height * 0.35, z, 12 + random() * 7, height, 9 + random() * 7);
  }
  for (const mesh of [resources.trunk, resources.canopy, resources.rocks, resources.grass, resources.ridges]) {
    mesh.instanceMatrix.needsUpdate = true;
    // InstancedMesh caches this after its first render. Refresh it when a new
    // habitat moves the instances so coast/forest switches cannot cull scenery.
    mesh.computeBoundingSphere();
  }
}
