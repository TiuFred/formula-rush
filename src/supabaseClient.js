// Cliente Supabase para o ranking ONLINE (ver leaderboard.js). O jogo
// continua funcionando sem nenhuma configuração — se as variáveis de
// ambiente abaixo não estiverem definidas, getSupabaseClient() retorna
// `null` e leaderboard.js cai automaticamente para o ranking local
// (localStorage), exatamente como antes.
//
// Para ativar o ranking online: crie um projeto em supabase.com, rode o SQL
// de docs/leaderboard-schema.sql nele, e copie a Project URL + a anon public
// key para um arquivo `.env.local` na raiz do projeto (ver .env.local.example).
// A anon key é uma credencial PÚBLICA por design do Supabase — protegida por
// Row Level Security no banco, não por ficar em segredo no bundle do cliente.

import { createClient } from "@supabase/supabase-js";

// `?? {}`: fora do Vite (ex.: um script Node avulso importando src/ direto
// para smoke-test) import.meta.env não existe — sem isso, o import deste
// módulo quebraria mesmo quando ninguém usa o ranking online.
const env = import.meta.env ?? {};
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;

const client = url && anonKey ? createClient(url, anonKey) : null;

if (!client) {
  console.info(
    "[leaderboard] VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY não configuradas — ranking online desativado, usando só o local. Ver docs/leaderboard-schema.sql."
  );
}

/** Retorna o client Supabase configurado, ou `null` se o ranking online não foi configurado. */
export function getSupabaseClient() {
  return client;
}
