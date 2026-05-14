// Generates PWA raster icons + favicon.ico from public/favicon.svg.
//
// Output:
//   public/icon-192.png        — PWA "any" icon, 192×192
//   public/icon-512.png        — PWA "any" icon, 512×512
//   public/icon-maskable.png   — PWA "maskable" icon, 512×512, logo at
//                                ~56% size with no rounded corners so
//                                Android can apply its own mask shape
//                                without cropping the glyph.
//   public/favicon.ico         — 32×32 PNG with .ico extension; modern
//                                browsers and crawlers accept this.
//
// Usage: node scripts/gen-icons.js

import { readFile, writeFile } from 'fs/promises';
import sharp from 'sharp';

const src = await readFile('public/favicon.svg');

// 1. Regular icons (any-purpose) — render the existing favicon.svg.
await sharp(src, { density: 384 }).resize(192, 192).png().toFile('public/icon-192.png');
await sharp(src, { density: 1024 }).resize(512, 512).png().toFile('public/icon-512.png');

// 2. Maskable variant — recompose with smaller glyph and no rounded
// corners. Android masks the icon to a circle/squircle and crops 10–20%,
// so the logo lives inside a ~56% safe zone in the centre.
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#efead6"/>
  <text x="16" y="22" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="18" font-weight="bold" fill="#963a2f">С</text>
</svg>`;
await sharp(Buffer.from(maskableSvg), { density: 1024 })
    .resize(512, 512)
    .png()
    .toFile('public/icon-maskable.png');

// 3. favicon.ico — a 32×32 PNG saved with the .ico extension. Every
// modern browser, including legacy Edge, accepts a PNG payload for
// /favicon.ico. Crawlers that probe the canonical path stop 404'ing.
const ico = await sharp(src, { density: 96 }).resize(32, 32).png().toBuffer();
await writeFile('public/favicon.ico', ico);

console.log('✓ icon-192.png');
console.log('✓ icon-512.png');
console.log('✓ icon-maskable.png');
console.log('✓ favicon.ico');
