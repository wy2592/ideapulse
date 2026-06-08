import { defineConfig } from "vite";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "preact"
  },
  server: {
    port: 5173,
    strictPort: false
  },
  build: {
    sourcemap: true
  }
});
