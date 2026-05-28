// Syncs the width/height attributes of every <img src="/images/..."> in
// index.html with the real pixel size of the file on disk. Run it after
// cropping or replacing an image so the hardcoded dimensions (which the
// browser uses to reserve space → no layout shift, and which the PhotoSwipe
// gallery reads for its aspect) never go stale.
//
// Only updates tags that already declare width AND height; never adds or
// removes attributes. Reports what changed and exits without writing if
// everything already matches.
//
// Usage: node scripts/sync-img-dims.js

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';

const HTML = 'index.html';
const IMAGES_DIR = 'public/images';

const html = await readFile(HTML, 'utf8');
let result = html;

// Each <img …> tag, including the multi-line ones ([^>] also matches newlines).
const tags = [...new Set(html.match(/<img\b[^>]*>/g) || [])];

let updated = 0;
let okCount = 0;
let missing = 0;

for (const tag of tags) {
    const src = tag.match(/src="\/images\/([^"]+)"/)?.[1];
    const w = tag.match(/\bwidth="(\d+)"/)?.[1];
    const h = tag.match(/\bheight="(\d+)"/)?.[1];
    if (!src || !w || !h) continue; // not a sized /images/ <img> — leave it

    const file = join(IMAGES_DIR, src);
    if (!existsSync(file)) {
        console.log(`✗ ${src} — file not found, skipped`);
        missing++;
        continue;
    }

    const { width, height } = await sharp(file).metadata();
    if (String(width) === w && String(height) === h) { okCount++; continue; }

    const fixed = tag
        .replace(/\bwidth="\d+"/, `width="${width}"`)
        .replace(/\bheight="\d+"/, `height="${height}"`);
    result = result.split(tag).join(fixed); // src is unique, but be safe
    console.log(`↻ ${src}  ${w}×${h} → ${width}×${height}`);
    updated++;
}

if (updated) await writeFile(HTML, result);
console.log(`\nUpdated ${updated}, already correct ${okCount}, missing ${missing}.`);
