// Generates missing .webp pairs for every .jpg/.jpeg in public/images/.
// Idempotent: skips images that already have a .webp neighbour.
//
// Usage: node scripts/gen-webp.js

import { readdir, writeFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, parse } from 'path';
import sharp from 'sharp';

const IMAGES_DIR = 'public/images';
const QUALITY = 80; // ViteImageOptimizer will re-encode at 75 on build

const files = await readdir(IMAGES_DIR);
const jpgs = files.filter(f => /\.jpe?g$/i.test(f)).sort();

let generated = 0;
let skippedExisting = 0;
let skippedNoGain = 0;

for (const jpg of jpgs) {
    const { name } = parse(jpg);
    const out = join(IMAGES_DIR, `${name}.webp`);
    if (existsSync(out)) { skippedExisting++; continue; }

    const jpgPath = join(IMAGES_DIR, jpg);
    const buf = await sharp(jpgPath).webp({ quality: QUALITY }).toBuffer();
    const jpgSize = (await stat(jpgPath)).size;

    // Skip if webp wouldn't save anything — source jpg is already efficient
    // and a <source type="image/webp"> would actually hurt these visitors.
    if (buf.length >= jpgSize) {
        console.log(`✗ ${name}.webp — bigger than jpg (${buf.length} vs ${jpgSize}), skipped`);
        skippedNoGain++;
        continue;
    }

    await writeFile(out, buf);
    console.log(`✓ ${name}.webp  (-${Math.round((jpgSize - buf.length) * 100 / jpgSize)}%)`);
    generated++;
}

console.log(`\nGenerated ${generated}, skipped ${skippedExisting} (pair existed), ${skippedNoGain} (no size gain).`);
