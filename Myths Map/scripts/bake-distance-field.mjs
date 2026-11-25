// Usage: node scripts/bake-distance-field.mjs [input.topo.json] [asset-directory]
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_BOUNDS, mercatorBounds, mercX, mercY } from '../src/engine/config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const input = process.argv[2] || path.join(root, 'topojson/country/hires/country.topo.0.1.json');
const output = process.argv[3] || path.join(root, 'public', 'assets');
const topology = JSON.parse(await readFile(input, 'utf8'));
const size = 1024;
const bounds = mercatorBounds(MAX_BOUNDS);
const dx = (bounds.maxX - bounds.minX) / size;
const dy = (bounds.maxY - bounds.minY) / size;
const extent = { left: size, right: 0, top: size, bottom: 0 };
const mask = new Uint8Array(size * size);

// Quantized arcs are independently delta-encoded. Unquantized arcs contain degrees.
const arcs = topology.arcs.map((arc) => {
  let x = 0, y = 0;
  return arc.map(([a, b]) => {
    let lng = a, lat = b;
    if (topology.transform) {
      const { scale, translate } = topology.transform;
      x += a; y += b;
      lng = x * scale[0] + translate[0];
      lat = y * scale[1] + translate[1];
    }
    return [(mercX(lng) - bounds.minX) / dx, (mercY(lat) - bounds.minY) / dy];
  });
});

function paintPolygon(rings) {
  const rows = new Map();
  for (const ring of rings) {
    // Edge orientation does not affect even-odd scan conversion. Shared arc
    // endpoints already coincide, including when TopoJSON references ~index.
    for (const index of ring) {
      const arc = arcs[index < 0 ? ~index : index];
      for (let i = 1; i < arc.length; i++) {
        const [x0, y0] = arc[i - 1], [x1, y1] = arc[i];
        const first = Math.max(0, Math.ceil(Math.min(y0, y1) - 0.5));
        const end = Math.min(size, Math.ceil(Math.max(y0, y1) - 0.5));
        for (let row = first; row < end; row++) {
          if (!rows.has(row)) rows.set(row, []);
          rows.get(row).push(x0 + (row + 0.5 - y0) * (x1 - x0) / (y1 - y0));
        }
      }
    }
  }
  for (const [row, intersections] of rows) {
    intersections.sort((a, b) => a - b);
    for (let i = 1; i < intersections.length; i += 2) {
      const left = Math.max(0, Math.ceil(intersections[i - 1] - 0.5));
      const end = Math.min(size, Math.ceil(intersections[i] - 0.5));
      if (end <= left) continue;
      mask.fill(1, row * size + left, row * size + end);
      extent.left = Math.min(extent.left, left); extent.right = Math.max(extent.right, end - 1);
      extent.top = Math.min(extent.top, row); extent.bottom = Math.max(extent.bottom, row);
    }
  }
}
function paint(geometry) {
  if (geometry.type === 'GeometryCollection') geometry.geometries.forEach(paint);
  if (geometry.type === 'Polygon') paintPolygon(geometry.arcs);
  if (geometry.type === 'MultiPolygon') geometry.arcs.forEach(paintPolygon);
}
Object.values(topology.objects).forEach(paint);
if (extent.left > extent.right) throw new Error('No land pixels inside the Mercator bounds.');

// Exact separable Euclidean distance transform. Weight axes independently
// because a square image covers a nonsquare patch of Mercator space.
const field = Float64Array.from(mask, (land) => land ? 0 : 1e12);
const f = new Float64Array(size), v = new Int32Array(size), z = new Float64Array(size + 1);
function transformLine(start, stride, weight) {
  for (let i = 0; i < size; i++) f[i] = field[start + i * stride];
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < size; q++) {
    let cut;
    while (true) {
      const p = v[k];
      cut = (f[q] - f[p]) / (2 * weight * (q - p)) + (q + p) / 2;
      if (cut > z[k]) break;
      k--;
    }
    v[++k] = q; z[k] = cut; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < size; q++) {
    while (z[k + 1] < q) k++;
    field[start + q * stride] = f[v[k]] + weight * (q - v[k]) ** 2;
  }
}
for (let y = 0; y < size; y++) transformLine(y * size, 1, 1);
for (let x = 0; x < size; x++) transformLine(x, size, (dy / dx) ** 2);
// Use the original land extent for the shallow-to-deep palette, independent of padding.
let maxSquared = 1;
for (let y = extent.top; y <= extent.bottom; y++) {
  for (let x = extent.left; x <= extent.right; x++) maxSquared = Math.max(maxSquared, field[y * size + x]);
}
const scanlines = Buffer.alloc(size * (size + 1)); // PNG filter 0, 8-bit grayscale.
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    scanlines[y * (size + 1) + 1 + x] = Math.round(255 * Math.min(1, Math.sqrt(field[y * size + x] / maxSquared)));
  }
}
function chunk(name, bytes) {
  const block = Buffer.alloc(12 + bytes.length);
  block.writeUInt32BE(bytes.length);
  block.write(name, 4, 'ascii'); bytes.copy(block, 8);
  let crc = 0xffffffff;
  for (const value of block.subarray(4, -4)) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  block.writeUInt32BE((crc ^ 0xffffffff) >>> 0, block.length - 4);
  return block;
}
const header = Buffer.alloc(13);
header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
  chunk('IDAT', deflateSync(scanlines, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'ph-distance-field.png'), png);
await writeFile(path.join(output, 'ph-distance-field.json'), JSON.stringify({
  width: size, height: size, bounds, geographicBounds: MAX_BOUNDS, rowZero: 'north', flipY: false,
  distanceAtWhite: Math.sqrt(maxSquared) * dx,
}, null, 2) + '\n');
console.log(`Baked ${size} × ${size} north-first distance field in ${output}`);
