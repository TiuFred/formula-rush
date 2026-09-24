// Pequenos helpers de DOM usados em todo o jogo.

/** Atalho para document.getElementById. */
export const byId = (id) => document.getElementById(id);

/**
 * Mostra (`visible = true`, padrão) ou oculta (`visible = false`) um elemento
 * pelo id, através da classe CSS "hidden" (ver assets/styles.css).
 */
export function setVisible(id, visible = true) {
  byId(id).classList.toggle("hidden", !visible);
}

/** Estado do timer do aviso (toast) atualmente visível, em segundos restantes. */
let noticeTimeRemaining = 0;

/** Mostra um aviso temporário (toast) na tela por ~2.5s. */
export function showNotice(text) {
  byId("notice").textContent = text;
  noticeTimeRemaining = 2.5;
  byId("notice").classList.add("show");
}

/** Deve ser chamado a cada frame com o delta de tempo para expirar o aviso. */
export function tickNotice(dt) {
  if (noticeTimeRemaining <= 0) return;
  noticeTimeRemaining -= dt;
  if (noticeTimeRemaining <= 0) byId("notice").classList.remove("show");
}
