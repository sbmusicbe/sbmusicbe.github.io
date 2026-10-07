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

-- ============================================================
-- Deel 2: versleutelde kluis (boekingen tussen toestellen) en aanvragen
-- ============================================================
-- De kluis bevat enkel versleutelde data (AES-256, sleutel uit je wachtwoord). De server kan ze niet lezen.
create table if not exists public.vault (
  id text primary key check (char_length(id) between 32 and 128),
  wt_hash text not null,
  blob jsonb not null,
  ver int not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.vault enable row level security;
revoke all on public.vault from anon, authenticated;

create or replace function public.vault_get(p_id text)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('blob', blob, 'ver', ver) from public.vault where id = p_id
$$;

create or replace function public.vault_put(p_id text, p_wt text, p_blob jsonb, p_ver int)
returns int language plpgsql security definer set search_path = public as $$
declare cur public.vault; h text := encode(sha256(convert_to(p_wt, 'UTF8')), 'hex');
begin
  if char_length(p_id) < 32 or char_length(p_wt) < 32 then raise exception 'ongeldig'; end if;
  if pg_column_size(p_blob) > 8000000 then raise exception 'te groot'; end if;
  select * into cur from public.vault where id = p_id for update;
  if not found then
    insert into public.vault (id, wt_hash, blob, ver) values (p_id, h, p_blob, 1);
    return 1;
  end if;
  if cur.wt_hash <> h then raise exception 'niet toegestaan'; end if;
  if cur.ver <> p_ver then raise exception 'conflict'; end if;
  update public.vault set blob = p_blob, ver = ver + 1, updated_at = now() where id = p_id;
  return cur.ver + 1;
end $$;

-- Aanvragen van het publieke formulier (aanvraag.html). Alleen de eigenaar van de kluis kan ze lezen.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;

create or replace function public.lead_add(p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if pg_column_size(p_data) > 8000 then raise exception 'te groot'; end if;
  if (select count(*) from public.leads) >= 500 then raise exception 'vol'; end if;
  insert into public.leads (data) values (p_data);
end $$;

create or replace function public.lead_list(p_id text, p_wt text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.vault v where v.id = p_id and v.wt_hash = encode(sha256(convert_to(p_wt, 'UTF8')), 'hex')) then
    raise exception 'niet toegestaan';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'data', l.data) order by l.created_at)
                   from (select * from public.leads order by created_at limit 100) l), '[]'::jsonb);
end $$;

create or replace function public.lead_done(p_id text, p_wt text, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.vault v where v.id = p_id and v.wt_hash = encode(sha256(convert_to(p_wt, 'UTF8')), 'hex')) then
    raise exception 'niet toegestaan';
  end if;
  delete from public.leads where id = any(p_ids);
end $$;

revoke all on function public.vault_get(text), public.vault_put(text, text, jsonb, int), public.lead_add(jsonb), public.lead_list(text, text), public.lead_done(text, text, uuid[]) from public;
grant execute on function public.vault_get(text), public.vault_put(text, text, jsonb, int), public.lead_add(jsonb), public.lead_list(text, text), public.lead_done(text, text, uuid[]) to anon;
