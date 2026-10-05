import { defineConfig } from "vite";

export default defineConfig({
  // Mantém a saída de build parecida com o layout original (assets/ na raiz
  // do dist/), só que agora gerada a partir dos módulos em src/.
  build: {
    outDir: "dist",
    assetsDir: "assets",
    // O vendor Three.js isolado fica em ~625 kB minificado (≈160 kB gzip) e a
    // 1.0 também precisa dele. O limite evita tratar esse chunk estável e
    // cacheável como regressão; o código só da 2.0 (menu, HUD, fantasma) vai
    // em outro chunk, carregado sob demanda (src/betaUi.js).
    chunkSizeWarningLimit: 650,
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
