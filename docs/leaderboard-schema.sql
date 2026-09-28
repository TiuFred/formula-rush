-- Schema do ranking ONLINE do Formula Rush.
--
-- Como usar:
--   1. Crie um projeto gratuito em https://supabase.com.
--   2. Abra "SQL Editor" no painel do projeto e rode este arquivo inteiro.
--   3. Em "Project Settings" → "API", copie a "Project URL" e a chave
--      "anon public" para um arquivo `.env.local` na raiz do projeto
--      (ver .env.local.example) e reinicie `npm run dev`.
--
-- Design: a tabela em si NÃO aceita INSERT/UPDATE/DELETE direto do cliente
-- (só SELECT, para exibir o ranking). Toda escrita passa pela função
-- submit_lap_time(), que só grava se o tempo novo for melhor que o já salvo
-- para aquele (circuito, nome de piloto) — isso impede que qualquer um
-- piore o tempo de outra pessoa e centraliza a regra "só grava se for
-- recorde" num único lugar (o banco), em vez de confiar só no cliente.
--
-- Limitação conhecida (documentada, não escondida): como é um jogo 100%
-- client-side sem validação server-side da corrida em si, a chave "anon"
-- (pública por natureza no Supabase) permite que alguém tecnicamente chame
-- submit_lap_time() diretamente com um tempo forjado, sem ter jogado. Não
-- há anti-cheat aqui — é um ranking "por honestidade", como o localStorage
-- que já existia, só que compartilhado entre jogadores.

create table if not exists public.leaderboard_entries (
  circuit_id text not null,
  player_name text not null,
  time_ms integer not null,
  updated_at timestamptz not null default now(),
  primary key (circuit_id, player_name)
);

alter table public.leaderboard_entries enable row level security;

-- Qualquer um pode LER o ranking (é público por natureza).
drop policy if exists "leaderboard_public_read" on public.leaderboard_entries;
create policy "leaderboard_public_read"
  on public.leaderboard_entries
  for select
  using (true);

-- Nenhuma policy de insert/update/delete é criada de propósito: a role
-- "anon" só pode escrever através da função abaixo (security definer),
-- que aplica a regra "só grava se for melhor".
create or replace function public.submit_lap_time(
  p_circuit_id text,
  p_player_name text,
  p_time_ms integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_time_ms is null or p_time_ms <= 0 or p_time_ms > 3600000 then
    return; -- tempo inválido (0, negativo ou acima de 1h) — ignora silenciosamente
  end if;

  insert into public.leaderboard_entries (circuit_id, player_name, time_ms, updated_at)
  values (
    left(trim(p_circuit_id), 32),
    left(trim(coalesce(p_player_name, 'Piloto')), 16),
    p_time_ms,
    now()
  )
  on conflict (circuit_id, player_name)
  do update set time_ms = excluded.time_ms, updated_at = excluded.updated_at
  where excluded.time_ms < leaderboard_entries.time_ms;
end;
$$;

grant execute on function public.submit_lap_time(text, text, integer) to anon;
grant select on public.leaderboard_entries to anon;
