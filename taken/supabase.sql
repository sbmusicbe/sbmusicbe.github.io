-- Taken: databasescript voor accounts (Supabase). Voer dit uit in de SQL Editor; het mag zo vaak je wilt (het is herhaalbaar).

create table if not exists vaults (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  blob       text not null,             -- versleutelde kluis (bij grote kluizen enkel de kern)
  wrapped    jsonb not null default '{}',
  rev        bigint not null default 1,
  updated_at timestamptz not null default now()
);

-- Zeer grote kluizen: de klanten staan apart, zodat een gewone wijziging niet de hele klantenlijst opnieuw uploadt.
alter table vaults add column if not exists clients text;
alter table vaults add column if not exists clients_rev text;

alter table vaults enable row level security;
drop policy if exists "eigen kluis lezen" on vaults;
drop policy if exists "eigen kluis maken" on vaults;
drop policy if exists "eigen kluis bijwerken" on vaults;
drop policy if exists "eigen kluis wissen" on vaults;
create policy "eigen kluis lezen"     on vaults for select to authenticated using (user_id = (select auth.uid()));
create policy "eigen kluis maken"     on vaults for insert to authenticated with check (user_id = (select auth.uid()));
create policy "eigen kluis bijwerken" on vaults for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "eigen kluis wissen"    on vaults for delete to authenticated using (user_id = (select auth.uid()));

-- Niemand zonder account komt bij de tabel, en ingelogde gebruikers alleen via bovenstaande regels (alleen de eigen rij).
revoke all on vaults from anon, public;
grant select, insert, update, delete on vaults to authenticated;
-- Een kluis is nooit groter dan 25 MB (tegen misbruik van de opslag).
alter table vaults drop constraint if exists vaults_grootte;
alter table vaults add constraint vaults_grootte check (octet_length(blob) <= 26214400 and coalesce(octet_length(clients), 0) <= 26214400);

-- Account verwijderen vanuit de app (Instellingen → Account verwijderen): wist de eigen gebruiker; de kluis verdwijnt via cascade mee.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'niet ingelogd'; end if;
  delete from auth.users where id = (select auth.uid());
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Optioneel, eenmalig: wist de oude klantenkolom voor alle gebruikers meteen (de app wist hem anders bij de eerstvolgende keer opslaan).
-- update vaults set clients = null, clients_rev = null;
