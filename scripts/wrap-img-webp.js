// Wraps bare <img src="/images/X.jpg"> tags in <picture> with a webp
// <source>, so browsers that support webp pick the smaller file.
//
// Idempotent and safe to re-run:
// - skips any <img> already preceded by <source srcset="/images/X.webp">
// - skips images that have no .webp neighbour on disk
//
// Usage: node scripts/wrap-img-webp.js

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

const path = 'index.html';
const html = await readFile(path, 'utf8');
const lines = html.split('\n');

const out = [];
let i = 0;
let wrapped = 0;
let skipped = 0;

while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^(\s+)<img src="\/images\/([\w-]+)\.jpg"/);

    if (!m) {
        out.push(line);
        i++;
        continue;
    }

    const indent = m[1];
    const name = m[2];

    // Already inside a <picture>? Previous non-empty out line will be the <source>.
    let prev = out.length - 1;
    while (prev >= 0 && out[prev].trim() === '') prev--;
    if (prev >= 0 && out[prev].includes(`<source srcset="/images/${name}.webp"`)) {
        out.push(line);
        i++;
        continue;
    }

    if (!existsSync(`public/images/${name}.webp`)) {
        out.push(line);
        i++;
        skipped++;
        continue;
    }

    // Collect the full <img ...> tag (may span multiple lines).
    const imgLines = [];
    let j = i;
    while (j < lines.length) {
        imgLines.push(lines[j]);
        if (lines[j].trimEnd().endsWith('>')) break;
        j++;
    }

    out.push(`${indent}<picture>`);
    out.push(`${indent}  <source srcset="/images/${name}.webp" type="image/webp">`);
    // Indent the original <img> block by +2 to stay inside <picture>.
    for (const il of imgLines) out.push('  ' + il);
    out.push(`${indent}</picture>`);

    i = j + 1;
    wrapped++;
}

await writeFile(path, out.join('\n'));
console.log(`Wrapped ${wrapped}, skipped ${skipped} (no webp pair).`);
