// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { satteri } from '@astrojs/markdown-satteri';
import { highlight } from './src/lib/highlight.mjs';
import { gallery } from './src/lib/gallery.mjs';
import { video, media } from './src/lib/video.mjs';
import { youtube } from './src/lib/youtube.mjs';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://johnnydong.com',
  // Pages as whisk.html, which GitHub Pages serves at /projects/whisk without redirecting to a slash
  build: { format: 'file' },
  trailingSlash: 'never',
  integrations: [media(), sitemap()],
  markdown: {
    // Gallery first: it reads the images' files before video and youtube swap them for HTML
    processor: satteri({ mdastPlugins: [highlight, gallery, video, youtube] }),
    // Code blocks stay plain text, styled by the site (.prose pre) rather than a Shiki theme
    syntaxHighlight: false,
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
