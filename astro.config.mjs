// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { satteri } from '@astrojs/markdown-satteri';
import { highlight } from './src/lib/highlight.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://johnnydong.com',
  markdown: {
    processor: satteri({ mdastPlugins: [highlight] }),
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
