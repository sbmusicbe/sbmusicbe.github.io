-- Muziekplanning live delen tussen DJ en klant.
-- Plak dit in Supabase > SQL Editor > Run.
create table if not exists public.muziek (
  token text primary key check (char_length(token) between 16 and 64),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Geen rechtstreekse toegang tot de tabel: alleen via de twee functies hieronder.
alter table public.muziek enable row level security;
revoke all on public.muziek from anon, authenticated;

create or replace function public.muziek_get(p_token text)
returns jsonb language sql security definer set search_path = public as $$
  select data from public.muziek where token = p_token
$$;

create or replace function public.muziek_set(p_token text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if char_length(p_token) < 16 or char_length(p_token) > 64 then raise exception 'ongeldig token'; end if;
  if pg_column_size(p_data) > 200000 then raise exception 'te groot'; end if;
  insert into public.muziek (token, data, updated_at) values (p_token, p_data, now())
  on conflict (token) do update set data = excluded.data, updated_at = now();
end $$;

revoke all on function public.muziek_get(text) from public;
revoke all on function public.muziek_set(text, jsonb) from public;
grant execute on function public.muziek_get(text) to anon;
grant execute on function public.muziek_set(text, jsonb) to anon;
