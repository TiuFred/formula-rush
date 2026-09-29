import { defineConfig } from "vite";

export default defineConfig({
  // Mantém a saída de build parecida com o layout original (assets/ na raiz
  // do dist/), só que agora gerada a partir dos módulos em src/.
  build: {
    outDir: "dist",
    assetsDir: "assets",
    // O vendor Three.js isolado fica em ~513 kB minificado (≈130 kB gzip).
    // O limite evita tratar esse chunk estável e cacheável como regressão.
    chunkSizeWarningLimit: 550,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "three",
              test: /node_modules[\\/]three/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
