// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { satteri } from '@astrojs/markdown-satteri';
import { highlight } from './src/lib/highlight.mjs';
import { video, media } from './src/lib/video.mjs';
import { youtube } from './src/lib/youtube.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://johnnydong.com',
  integrations: [media()],
  markdown: {
    processor: satteri({ mdastPlugins: [highlight, video, youtube] }),
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
