import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// TODO: update `site` to the domain you deploy to
export default defineConfig({
  site: 'https://truongnguyen.io',
  output: 'static',
  integrations: [sitemap()],
});
