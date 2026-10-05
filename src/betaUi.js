// Interface exclusiva da 2.0 (menu, HUD, fantasma): carregada sob demanda,
// só quando o jogador toca em "Formula Rush 2.0", para a abertura da 1.0 não
// baixar esse código nem o CSS da HUD. Ver `loadBetaUi` em main.js.
import "./betaHud.css";

export { closeBetaMenu, openBetaMenu, showBetaLoading } from "./betaMenu.js";
export { updateBetaHud } from "./betaHud.js";
export { updateBetaGhost } from "./betaGhost.js";
