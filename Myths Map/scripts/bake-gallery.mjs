// Usage: node scripts/bake-gallery.mjs [assets-directory]
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const assetsDir = process.argv[2] || path.join(root, 'public', 'assets');

const IMAGE_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg', '.svg']);
const IGNORED_ROOT_STEMS = new Set(['ph-distance-field', 'parchment-grain']);

async function scanImageDir(dirPath) {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;
    const stem = path.basename(entry.name, path.extname(entry.name));
    files.push({ stem, filename: entry.name });
  }
  files.sort((a, b) => a.stem.localeCompare(b.stem));
  return files;
}

const [bannerFiles, inkFiles, rootFiles] = await Promise.all([
  scanImageDir(path.join(assetsDir, 'banners')),
  scanImageDir(path.join(assetsDir, 'ink')),
  scanImageDir(assetsDir),
]);

let communityMarker = '';
const creatureMap = new Map();

function ensureCreature(stem) {
  if (!creatureMap.has(stem)) creatureMap.set(stem, {});
  return creatureMap.get(stem);
}

for (const { stem, filename } of bannerFiles) {
  ensureCreature(stem).banner = `/assets/banners/${filename}`;
}

for (const { stem, filename } of inkFiles) {
  if (stem === 'community') {
    communityMarker = `/assets/ink/${filename}`;
    continue;
  }
  ensureCreature(stem).marker = `/assets/ink/${filename}`;
}

for (const { stem, filename } of rootFiles) {
  if (IGNORED_ROOT_STEMS.has(stem)) continue;
  ensureCreature(stem).illustration = `/assets/${filename}`;
}

const sortedStems = [...creatureMap.keys()].sort((a, b) => a.localeCompare(b));
const creatures = {};
for (const stem of sortedStems) {
  creatures[stem] = creatureMap.get(stem);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  count: sortedStems.length,
  communityMarker,
  creatures,
};

const outputPath = path.join(assetsDir, 'gallery.json');
await writeFile(outputPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`Baked gallery manifest (${manifest.count} creatures) -> ${outputPath}`);
