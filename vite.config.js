import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages hosts this repository at /Websat/; local and desktop builds stay at /.
  base: process.env.GITHUB_PAGES === 'true' ? '/Websat/' : '/',
  server: { port: 5173, strictPort: true, allowedHosts: true },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    emptyOutDir: true
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js']
  }
});
