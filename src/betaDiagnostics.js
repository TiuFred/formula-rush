/**
 * Coleta o mínimo para um relato de problema útil: média de FPS, últimos erros
 * e o ambiente. Nada é enviado automaticamente; o texto só vai para a URL de
 * feedback quando o jogador clica no botão.
 */

const MAX_ERRORS = 3;
const errors = [];
let fps = 0;
let installed = false;

export function recordFrame(dt) {
  if (dt > 0 && dt < 1) fps = fps === 0 ? 1 / dt : fps + (1 / dt - fps) * 0.05;
}

export function recordError(message) {
  const text = String(message ?? "").slice(0, 160);
  if (!text || errors.includes(text)) return;
  errors.push(text);
  if (errors.length > MAX_ERRORS) errors.shift();
}

/** Registra erros não tratados da página. Seguro chamar mais de uma vez. */
export function installErrorCollector(target = globalThis) {
  if (installed || typeof target?.addEventListener !== "function") return;
  installed = true;
  target.addEventListener("error", (event) => recordError(event.message));
  target.addEventListener("unhandledrejection", (event) => recordError(event.reason?.message ?? event.reason));
}

export function resetDiagnostics() {
  errors.length = 0;
  fps = 0;
}

export function diagnosticsText({ settings, env = {} }) {
  const lines = [
    "Versão: Formula Rush 2.0 beta",
    `Qualidade: ${settings.quality} · horário: ${settings.time} · FOV ${settings.fov}`,
    `FPS médio: ${fps ? Math.round(fps) : "n/d"}`,
    `Tela: ${env.screen ?? "n/d"} · pixel ratio ${env.pixelRatio ?? "n/d"}`,
    `Navegador: ${env.userAgent ?? "n/d"}`,
    `Erros recentes: ${errors.length ? errors.join(" | ") : "nenhum"}`,
  ];
  return lines.join("\n");
}

/**
 * URL para abrir um relato já preenchido. `base` pode vir de VITE_FEEDBACK_URL;
 * sem ele usa o repositório do projeto no GitHub.
 */
export function feedbackUrl({ base, settings, env }) {
  const root = (base || "https://github.com/TiuFred/formula-rush/issues/new").trim();
  const url = new URL(root);
  url.searchParams.set("title", "[Beta 2.0] ");
  url.searchParams.set("body", `**O que aconteceu?**\n\n\n---\n${diagnosticsText({ settings, env })}`);
  return url.toString();
}
