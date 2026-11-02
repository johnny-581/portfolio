// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://johnnydong.com',
  // v3 project URLs now live at the top level
  redirects: Object.fromEntries(
    ['access-buddy', 'e-commerce-data-agent', 'pepper-docs', 'posture-reminder', 'ubc-uxhub-portal', 'whisk'].map(
      (slug) => [`/projects/${slug}`, `/${slug}`],
    ),
  ),
  vite: {
    plugins: [tailwindcss()],
  },
});
