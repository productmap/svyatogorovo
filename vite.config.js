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

function inlineSvgPlugin() {
  const replaceImgWithSvg = (html) => {
    return html.replace(
      /<img src="\/images\/([^"]+\.svg)"([^>]*)>/gi,
      (match, filename, attrs) => {
        const fs = require('fs');
        const path = require('path');
        const svgPath = path.resolve(__dirname, 'public/images', filename);

        if (fs.existsSync(svgPath)) {
          const svgContent = fs.readFileSync(svgPath, 'utf-8');
          const svgMatch = svgContent.match(/<svg([^>]*viewBox="[^"]*"[^>]*)>/i);
          const svgAttrs = svgMatch ? svgMatch[1] : ' viewBox="0 0 506.99 20.25"';
          const innerContent = svgContent.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i)?.[1] || svgContent;
          const imgClass = attrs.match(/class="([^"]+)"/)?.[1] || '';
          const svgClass = imgClass ? ` class="${imgClass}"` : '';
          return `<svg${svgAttrs}${svgClass} xmlns="http://www.w3.org/2000/svg">${innerContent}</svg>`;
        }
        return match;
      }
    );
  };

  return {
    name: 'inline-svg',
    enforce: 'pre',
    transformIndexHtml(html) {
      return replaceImgWithSvg(html);
    },
    generateBundle(_, bundle) {
      const htmlEntry = Object.entries(bundle).find(([name]) => name.endsWith('.html'));
      if (!htmlEntry) return;

      const [cssName, htmlChunk] = htmlEntry;
      htmlChunk.source = replaceImgWithSvg(htmlChunk.source);
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
    inlineSvgPlugin(),
  ],
});