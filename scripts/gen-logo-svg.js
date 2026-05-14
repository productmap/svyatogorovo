// Regenerates the brand logo SVGs from the VezitsaCyrillic webfont.
//
// Reads public/fonts/vezitsacyrillic.woff2, extracts the С glyph as an SVG
// <path>, and writes two compositions:
//   public/icons/favicon.svg            — the brand logo. Glyph at ~72% of the
//                                   viewBox, parchment background with a
//                                   browser-favicon-style rounded corner.
//   public/icons/favicon-maskable.svg   — same glyph at ~56% (sits inside the
//                                   Android maskable safe-zone), no rounded
//                                   corners so the launcher applies its own
//                                   mask shape.
//
// Path extraction means the SVGs are font-independent — librsvg (sharp)
// and every browser render them identically without needing the webfont
// loaded.
//
// Usage: node scripts/gen-logo-svg.js

import { readFile, writeFile } from 'fs/promises';
import opentype from 'opentype.js';
import wawoff from 'wawoff2';

const BG   = '#efead6'; // parchment
const FG   = '#be5034'; // $color-accent — primary brand red
const SIZE = 32;

// opentype.js can't read woff2 directly — decompress to sfnt first.
const woff2 = await readFile('public/fonts/vezitsacyrillic.woff2');
const sfntBytes = await wawoff.decompress(woff2);
const sfntBuf = Buffer.from(sfntBytes);
const font = opentype.parse(sfntBuf.buffer.slice(sfntBuf.byteOffset, sfntBuf.byteOffset + sfntBuf.byteLength));

// Get path metrics once at a probe size, then we can scale to taste.
const PROBE = 100;
const probePath = font.getPath('С', 0, 0, PROBE);
const pb = probePath.getBoundingBox();
const glyphW = pb.x2 - pb.x1;
const glyphH = pb.y2 - pb.y1;

function buildSvg({ targetFrac, rx }) {
    const scale = Math.min(SIZE * targetFrac / glyphW, SIZE * targetFrac / glyphH);
    const fontSize = PROBE * scale;
    const path = font.getPath('С', 0, 0, fontSize);
    const b = path.getBoundingBox();
    const dx = (SIZE - (b.x2 - b.x1)) / 2 - b.x1;
    const dy = (SIZE - (b.y2 - b.y1)) / 2 - b.y1;
    for (const cmd of path.commands) {
        if (cmd.x  != null) cmd.x  += dx;
        if (cmd.y  != null) cmd.y  += dy;
        if (cmd.x1 != null) cmd.x1 += dx;
        if (cmd.y1 != null) cmd.y1 += dy;
        if (cmd.x2 != null) cmd.x2 += dx;
        if (cmd.y2 != null) cmd.y2 += dy;
    }
    const d = path.toPathData(3);
    const rect = rx > 0
        ? `<rect width="${SIZE}" height="${SIZE}" rx="${rx}" fill="${BG}"/>`
        : `<rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">
  ${rect}
  <path d="${d}" fill="${FG}"/>
</svg>
`;
}

// Brand logo — favicon, PWA "any" purpose, og:image source.
await writeFile('public/icons/favicon.svg', buildSvg({ targetFrac: 0.72, rx: 5 }));
console.log('✓ public/icons/favicon.svg            (72% glyph, rounded corners)');

// Maskable variant — Android launchers crop ~10-20% off each edge, so the
// glyph lives in the centre 56% safe-zone and the background is square.
await writeFile('public/icons/favicon-maskable.svg', buildSvg({ targetFrac: 0.56, rx: 0 }));
console.log('✓ public/icons/favicon-maskable.svg   (56% glyph, square — maskable safe-zone)');
