// "Leaderboard" das melhores voltas — salvo LOCALMENTE no navegador
// (localStorage), com uma entrada por NOME digitado em "SEU PILOTO", por
// circuito. Sempre que uma volta bate o recorde salvo daquele nome, ela
// substitui a entrada anterior.
//
// Importante (ver docs/AUDITORIA.md): isto NÃO é um leaderboard global
// entre jogadores de máquinas diferentes — este projeto é um site estático
// sem servidor/banco de dados, então não há como sincronizar rankings entre
// dispositivos. Cada navegador tem o seu próprio ranking, e nomes iguais
// digitados por pessoas diferentes no MESMO navegador se sobrescrevem entre
// si (não há contas nem autenticação).

const STORAGE_KEY = "formula-rush-leaderboard-v1";

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage indisponível (modo privado, quota cheia...) — o jogo
    // continua funcionando normalmente, só não persiste o ranking.
  }
}

/**
 * Registra uma volta de `playerName` no circuito `circuitId`. Só é salva se
 * for melhor que a entrada já existente para esse MESMO nome. Retorna
 * `true` se esta volta se tornou (ou manteve) o recorde salvo.
 */
export function recordLap(circuitId, playerName, lapTime) {
  if (!Number.isFinite(lapTime) || lapTime <= 0) return false;
  const name = (playerName || "Piloto").trim().slice(0, 16) || "Piloto";
  const all = loadAll();
  const board = all[circuitId] || (all[circuitId] = {});
  const existing = board[name];
  if (existing && existing.time <= lapTime) return false;
  board[name] = { time: lapTime, date: Date.now() };
  saveAll(all);
  return true;
}

/** Retorna as entradas do circuito `circuitId`, da mais rápida para a mais lenta. */
export function getLeaderboard(circuitId) {
  const board = loadAll()[circuitId] || {};
  return Object.entries(board)
    .map(([name, entry]) => ({ name, time: entry.time, date: entry.date }))
    .sort((a, b) => a.time - b.time);
}

/** Apaga todas as entradas salvas, de todos os circuitos. */
export function clearLeaderboard() {
  saveAll({});
}
