// Compresses source photos in public/images/ through TinyPNG / Tinify
// (https://tinify.com) — usually beats sharp / editor exports on jpg & png.
// Overwrites each file in place with the smaller result (skips if not smaller).
//
// By default only images changed vs git HEAD (plus untracked) are sent, to
// spare the monthly Tinify quota. Pass --all for every jpg/png, or pass paths.
//
// Needs an API key in .env (gitignored — never commit it):
//   TINIFY_API_KEY=your_key
//
// Usage:
//   node scripts/optimize-images.js                       # changed images only
//   node scripts/optimize-images.js --all                 # every jpg/png
//   node scripts/optimize-images.js public/images/x.jpg   # specific files
//
// Afterwards run the rest of the image workflow:
//   node scripts/gen-webp.js && node scripts/sync-img-dims.js

import { readFile, writeFile, stat, readdir } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import tinify from 'tinify';

const IMAGES_DIR = 'public/images';
const isImg = (f) => /\.(jpe?g|png)$/i.test(f);

// Pull the key from .env if the shell didn't export it, so a plain
// `node scripts/optimize-images.js` works without an --env-file flag.
if (!process.env.TINIFY_API_KEY && existsSync('.env')) {
    const m = readFileSync('.env', 'utf8').match(/^\s*TINIFY_API_KEY\s*=\s*(.+?)\s*$/m);
    if (m) process.env.TINIFY_API_KEY = m[1].replace(/^["']|["']$/g, '');
}
if (!process.env.TINIFY_API_KEY) {
    console.error('✗ TINIFY_API_KEY is not set. Add it to .env:\n    TINIFY_API_KEY=your_key');
    process.exit(1);
}
tinify.key = process.env.TINIFY_API_KEY;

// ── choose which files to send ───────────────────────────────────────────────
const args = process.argv.slice(2);
let targets;
if (args.includes('--all')) {
    targets = (await readdir(IMAGES_DIR)).filter(isImg).sort().map((f) => join(IMAGES_DIR, f));
} else if (args.length) {
    targets = args.filter(isImg);
} else {
    const status = execSync(`git status --porcelain -- ${IMAGES_DIR}`).toString();
    targets = status
        .split('\n')
        .map((l) => l.slice(3).trim()) // strip the "XY " porcelain prefix
        .filter((p) => p && isImg(p) && existsSync(p));
}

if (!targets.length) {
    console.log('Nothing to do — no changed jpg/png in public/images. (Use --all to process everything.)');
    process.exit(0);
}

// Validate the key up front — this does NOT count against the compression quota.
try {
    await tinify.validate();
} catch (e) {
    console.error('✗ Tinify key rejected or API unreachable:', e.message);
    process.exit(1);
}

let savedBytes = 0;
let done = 0;
for (const path of targets) {
    const name = path.replace(`${IMAGES_DIR}/`, '');
    try {
        const before = (await stat(path)).size;
        const buf = await tinify.fromBuffer(await readFile(path)).toBuffer();
        if (buf.length < before) {
            await writeFile(path, buf);
            savedBytes += before - buf.length;
            console.log(`✓ ${name}  ${(before / 1024) | 0}KB → ${(buf.length / 1024) | 0}KB  (-${Math.round(((before - buf.length) * 100) / before)}%)`);
        } else {
            console.log(`• ${name}  already optimal (${(before / 1024) | 0}KB)`);
        }
        done++;
    } catch (e) {
        console.error(`✗ ${name}: ${e.message}`);
    }
}

const used = typeof tinify.compressionCount === 'number' ? tinify.compressionCount : '?';
console.log(`\nDone ${done}/${targets.length}. Saved ${(savedBytes / 1024) | 0}KB. Tinify compressions used this month: ${used}.`);
console.log('Next: node scripts/gen-webp.js && node scripts/sync-img-dims.js');
