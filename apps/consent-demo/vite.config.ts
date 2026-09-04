import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
// Force cache invalidation
export default defineConfig({
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
    dedupe: ['react', 'react-dom'],
  },
  server: {
    watch: {
      // Vite ignores node_modules by default — this un-ignores just the
      // linked package's dist output so edits there trigger a reload.
      ignored: ['!**/node_modules/@mcp-b/react-webmcp/dist/**'],
    },
  },
  optimizeDeps: {
    // Prevent Vite from pre-bundling/caching the linked package, which
    // would otherwise mask changes until a manual cache clear.
    exclude: ['@mcp-b/react-webmcp'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          if (
            id.includes('node_modules/zod') ||
            id.includes('node_modules/@modelcontextprotocol')
          ) {
            return 'mcp-vendor';
          }
        },
      },
    },
  },
});
