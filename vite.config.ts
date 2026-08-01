import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'WitsAuthJSClient',
      fileName: (format) => `index.${format}.js`
    },
    rollupOptions: {
      external: [], // No external dependencies
      output: {
        globals: {}
      }
    }
  },
  plugins: [dts({ exclude: ['**/*.spec.ts'] })]
});
