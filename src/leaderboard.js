// "Leaderboard" das melhores voltas — agora ONLINE (Supabase) quando
// configurado (ver src/supabaseClient.js e docs/leaderboard-schema.sql),
// com fallback automático para o ranking LOCAL (localStorage) se o projeto
// não tiver sido configurado, se a rede cair, ou se a chamada falhar por
// qualquer motivo. O ranking local nunca deixa de ser gravado — mesmo com o
// online ativo, ele continua funcionando como cópia offline própria de cada
// navegador.

import { getSupabaseClient } from "./supabaseClient.js";

const STORAGE_KEY = "formula-rush-leaderboard-v1";

function loadAllLocal() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveAllLocal(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage indisponível (modo privado, quota cheia...) — o jogo
    // continua funcionando normalmente, só não persiste o ranking local.
  }
}

/** Registra uma volta no ranking LOCAL deste navegador. Retorna `true` se bateu o recorde salvo. */
function recordLapLocal(circuitId, playerName, lapTime) {
  if (!Number.isFinite(lapTime) || lapTime <= 0) return false;
  const name = (playerName || "Piloto").trim().slice(0, 16) || "Piloto";
  const all = loadAllLocal();
  const board = all[circuitId] || (all[circuitId] = {});
  const existing = board[name];
  if (existing && existing.time <= lapTime) return false;
  board[name] = { time: lapTime, date: Date.now() };
  saveAllLocal(all);
  return true;
}

/** Retorna as entradas do ranking LOCAL do circuito `circuitId`, da mais rápida para a mais lenta. */
function getLeaderboardLocal(circuitId) {
  const board = loadAllLocal()[circuitId] || {};
  return Object.entries(board)
    .map(([name, entry]) => ({ name, time: entry.time }))
    .sort((a, b) => a.time - b.time);
}

/**
 * Registra uma volta de `playerName` no circuito `circuitId`: sempre grava
 * no ranking local deste navegador, e — se o ranking online estiver
 * configurado — também tenta enviar para o Supabase (a função
 * `submit_lap_time` do banco só substitui o valor salvo se este for
 * melhor; ver docs/leaderboard-schema.sql). Falhas de rede/config no envio
 * online são silenciosas (só um aviso no console): o jogo nunca trava por
 * causa do ranking.
 */
export async function recordLap(circuitId, playerName, lapTime) {
  const improvedLocally = recordLapLocal(circuitId, playerName, lapTime);

  const supabase = getSupabaseClient();
  if (supabase && Number.isFinite(lapTime) && lapTime > 0) {
    try {
      const name = (playerName || "Piloto").trim().slice(0, 16) || "Piloto";
      const { error } = await supabase.rpc("submit_lap_time", {
        p_circuit_id: circuitId,
        p_player_name: name,
        p_time_ms: Math.round(lapTime * 1000),
      });
      if (error) throw error;
    } catch (err) {
      console.warn("[leaderboard] Não foi possível enviar a volta ao ranking online (mantendo o local):", err);
    }
  }
  return improvedLocally;
}

/**
 * Retorna as entradas do ranking do circuito `circuitId`, da mais rápida
 * para a mais lenta, junto com um flag `online` indicando se vieram do
 * Supabase (ranking global) ou do fallback local deste navegador.
 * @returns {Promise<{online: boolean, entries: {name: string, time: number}[]}>}
 */
export async function getLeaderboard(circuitId) {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("leaderboard_entries")
        .select("player_name, time_ms")
        .eq("circuit_id", circuitId)
        .order("time_ms", { ascending: true })
        .limit(50);
      if (error) throw error;
      return {
        online: true,
        entries: data.map((row) => ({ name: row.player_name, time: row.time_ms / 1000 })),
      };
    } catch (err) {
      console.warn("[leaderboard] Ranking online indisponível, mostrando o ranking local:", err);
    }
  }
  return { online: false, entries: getLeaderboardLocal(circuitId) };
}

/** Apaga todas as entradas do ranking LOCAL (não afeta o ranking online). */
export function clearLeaderboard() {
  saveAllLocal({});
}
