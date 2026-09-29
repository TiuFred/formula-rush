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
-- Hardening: a função aceita apenas os cinco circuitos conhecidos, nomes não
-- vazios, tempos entre 20 s e 15 min, remove caracteres de controle e não
-- herda permissões públicas implícitas. A UI também trata nomes só como texto.
--
-- Limitação estrutural: como é um jogo 100%
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

-- Revoga permissões que possam ter sido concedidas numa execução/configuração
-- anterior. Clientes só recebem SELECT novamente no fim deste arquivo.
revoke all on table public.leaderboard_entries from public, anon, authenticated;

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
set search_path = pg_catalog, public
as $$
begin
  if trim(coalesce(p_circuit_id, '')) not in
    ('interlagos', 'monza', 'indianapolis', 'monaco', 'spa') then
    raise exception 'circuito inválido';
  end if;

  if p_time_ms is null or p_time_ms < 20000 or p_time_ms > 900000 then
    raise exception 'tempo fora dos limites';
  end if;

  p_player_name := left(
    trim(regexp_replace(coalesce(p_player_name, 'Piloto'), '[[:cntrl:]]', ' ', 'g')),
    16
  );
  if p_player_name = '' then
    p_player_name := 'Piloto';
  end if;

  insert into public.leaderboard_entries (circuit_id, player_name, time_ms, updated_at)
  values (
    trim(p_circuit_id),
    p_player_name,
    p_time_ms,
    now()
  )
  on conflict (circuit_id, player_name)
  do update set time_ms = excluded.time_ms, updated_at = excluded.updated_at
  where excluded.time_ms < leaderboard_entries.time_ms;
end;
$$;

revoke all on function public.submit_lap_time(text, text, integer) from public;
grant execute on function public.submit_lap_time(text, text, integer) to anon;
grant execute on function public.submit_lap_time(text, text, integer) to authenticated;
grant select on public.leaderboard_entries to anon;
grant select on public.leaderboard_entries to authenticated;
