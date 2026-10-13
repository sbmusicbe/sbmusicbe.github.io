-- Uitvoeren in de SQL Editor van het bestaande Supabase-project.
-- Apart van taken/vaults: dit script wijzigt geen bestaande klantgegevens.
create table if not exists public.crm_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  blob text not null check (octet_length(blob) <= 35000000),
  rev bigint not null default 1 check (rev > 0),
  updated_at timestamptz not null default now()
);
alter table public.crm_vaults enable row level security;
drop policy if exists "CRM eigen kluis lezen" on public.crm_vaults;
drop policy if exists "CRM eigen kluis maken" on public.crm_vaults;
drop policy if exists "CRM eigen kluis bijwerken" on public.crm_vaults;
drop policy if exists "CRM eigen kluis wissen" on public.crm_vaults;
create policy "CRM eigen kluis lezen" on public.crm_vaults for select to authenticated using (user_id=(select auth.uid()));
create policy "CRM eigen kluis maken" on public.crm_vaults for insert to authenticated with check (user_id=(select auth.uid()));
create policy "CRM eigen kluis bijwerken" on public.crm_vaults for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "CRM eigen kluis wissen" on public.crm_vaults for delete to authenticated using (user_id=(select auth.uid()));
revoke all on public.crm_vaults from anon, public;
grant select, insert, update, delete on public.crm_vaults to authenticated;
