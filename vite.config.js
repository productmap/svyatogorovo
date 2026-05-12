import { defineConfig } from 'vite';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';

function inlineCssPlugin() {
  return {
    name: 'inline-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const cssEntry = Object.entries(bundle).find(([name]) => name.endsWith('.css'));
      const htmlEntry = Object.entries(bundle).find(([name]) => name.endsWith('.html'));
      if (!cssEntry || !htmlEntry) return;

      const [cssName, cssChunk] = cssEntry;
      const [, htmlChunk] = htmlEntry;

      htmlChunk.source = htmlChunk.source.replace(
        /<link rel="stylesheet"[^>]*>/gi,
        `<style>${cssChunk.source}</style>`
      );
      delete bundle[cssName];
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [
    ViteImageOptimizer({
      jpg: { quality: 75 },
      jpeg: { quality: 75 },
      webp: { quality: 75 },
      png: { quality: 75 },
    }),
    inlineCssPlugin(),
  ],
});