// Generates .webp pairs for every .jpg/.jpeg in public/images/.
// (Re)generates when the .webp is missing OR older than its .jpg, so editing a
// source image and re-running this picks up the change — it no longer blindly
// skips every existing pair.
//
// Usage: node scripts/gen-webp.js

import { readdir, writeFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, parse } from 'path';
import sharp from 'sharp';

const IMAGES_DIR = 'public/images';
const QUALITY = 80;

// Photos that don't take part in the <picture>+webp scheme. og-image is only
// referenced as .jpg from og:/twitter: meta tags, so a webp pair is dead
// weight — and without this list gen-webp would re-create it on every run.
const SKIP = new Set(['og-image']);

const files = await readdir(IMAGES_DIR);
const jpgs = files.filter(f => /\.jpe?g$/i.test(f)).sort();

let generated = 0;
let skippedExisting = 0;
let skippedNoGain = 0;
let skippedExcluded = 0;

for (const jpg of jpgs) {
    const { name } = parse(jpg);
    if (SKIP.has(name)) { skippedExcluded++; continue; }
    const jpgPath = join(IMAGES_DIR, jpg);
    const out = join(IMAGES_DIR, `${name}.webp`);
    const existed = existsSync(out);

    // Skip only if an up-to-date webp already exists (jpg untouched since).
    if (existed) {
        const [j, w] = await Promise.all([stat(jpgPath), stat(out)]);
        if (w.mtimeMs >= j.mtimeMs) { skippedExisting++; continue; }
    }

    const jpgSize = (await stat(jpgPath)).size;
    const buf = await sharp(jpgPath).webp({ quality: QUALITY }).toBuffer();

    // Refuse only to *create* a brand-new webp that wouldn't save anything —
    // no point adding a <source> that hurts. An existing pair is always
    // refreshed in place (the markup may reference it; removing it would
    // break <picture>).
    if (!existed && buf.length >= jpgSize) {
        console.log(`✗ ${name}.webp — bigger than jpg (${buf.length} vs ${jpgSize}), skipped`);
        skippedNoGain++;
        continue;
    }

    await writeFile(out, buf);
    const pct = Math.round((jpgSize - buf.length) * 100 / jpgSize);
    console.log(`${pct >= 0 ? '✓' : '•'} ${name}.webp  (${pct >= 0 ? '-' : '+'}${Math.abs(pct)}%${existed ? ', refreshed' : ''})`);
    generated++;
}

console.log(`\nGenerated ${generated}, skipped ${skippedExisting} (pair existed), ${skippedNoGain} (no size gain), ${skippedExcluded} (excluded).`);
