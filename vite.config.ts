import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const raiz = path.dirname(fileURLToPath(import.meta.url));

// La interfaz vive en web/ y se compila a web/dist (la sirve el servidor de src/server).
export default defineConfig({
  root: path.join(raiz, "web"),
  plugins: [react()],
  build: { outDir: path.join(raiz, "web", "dist"), emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  server: { proxy: { "/api": "http://localhost:3000", "/jobs": "http://localhost:3000" } },
});
