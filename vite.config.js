import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Single-file build: everything (JS + CSS) is inlined into one index.html,
// which is what js13kGames requires. Terser is tuned for maximum shrinkage;
// Roadroller can be layered on in Phase 3 for the final byte squeeze.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'esnext',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    minify: 'terser',
    terserOptions: {
      ecma: 2020,
      module: true,
      toplevel: true,
      compress: {
        passes: 3,
        drop_console: true,
        pure_getters: true,
        unsafe: true,
        unsafe_arrows: true,
        unsafe_math: true,
      },
      mangle: { toplevel: true },
      format: { comments: false },
    },
  },
});
