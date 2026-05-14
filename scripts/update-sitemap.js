// Refreshes <lastmod> in public/sitemap.xml to today's date.
//
// Wired up as `prebuild` in package.json so every production build (and
// therefore every deploy) ships a sitemap that tells crawlers the content
// was updated today. Idempotent — re-running on the same day is a no-op.
//
// Usage: node scripts/update-sitemap.js

import { readFile, writeFile } from 'fs/promises';

const FILE = 'public/sitemap.xml';
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

const xml = await readFile(FILE, 'utf8');
const updated = xml.replace(
    /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g,
    `<lastmod>${today}</lastmod>`,
);

if (updated === xml) {
    console.log(`sitemap.xml: lastmod already ${today}, no change`);
} else {
    await writeFile(FILE, updated);
    console.log(`sitemap.xml: lastmod → ${today}`);
}
