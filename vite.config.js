import { defineConfig } from "vite";

export default defineConfig({
  // Mantém a saída de build parecida com o layout original (assets/ na raiz
  // do dist/), só que agora gerada a partir dos módulos em src/.
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
  server: {
    port: 5173,
  },
});
