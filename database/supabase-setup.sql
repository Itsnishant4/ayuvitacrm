-- ============================================================
-- ayuvitaCRM — Supabase `referrals` table recovery setup
-- Run this ONCE in the Supabase Dashboard → SQL Editor
-- Project: hffejglwnhaxzvwufvyx
-- ============================================================

-- 1. Table
create table if not exists public.referrals (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text,
  phone         text not null,
  referral_code text unique,
  parent_code   text references public.referrals (referral_code),
  role          text not null default 'retailer',
  region        text,
  created_at    timestamptz not null default now()
);

-- 2. Indexes
create index if not exists referrals_parent_code_idx on public.referrals (parent_code);
create index if not exists referrals_role_idx on public.referrals (role);
create index if not exists referrals_created_at_idx on public.referrals (created_at desc);

-- 3. RLS — replicate the app's current behaviour (desktop app talks with the
--    anon/publishable key, no per-user Supabase auth tokens yet).
--    Full CRUD is required for these IPC flows to keep working:
--      supabase-verify-referral (select)
--      supabase-get-partners    (select)
--      supabase-add-partner     (insert)
--      supabase-update-partner  (update)
--      supabase-delete-partner  (delete)
-- NOTE: harden later when the app can log into Supabase Auth — see comment at bottom.
alter table public.referrals enable row level security;

drop policy if exists "anon full access on referrals" on public.referrals;
create policy "anon full access on referrals"
  on public.referrals
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- 4. Realtime (optional — app does not subscribe, but cheap to enable).
--    Idempotent: drop first if already a member, then re-add.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'referrals'
  ) then
    alter publication supabase_realtime drop table public.referrals;
  end if;
  alter publication supabase_realtime add table public.referrals;
end $$;

-- 5. RLS hardening — token-gated access.
--    The publishable key alone is NOT enough anymore; a shared secret header
--    'x-crm-secret' must match the value stored below. Electron app sends it
--    automatically (see database/supabaseClient.js, env SUPABASE_RLS_SECRET).
create schema if not exists private;
create table if not exists private.app_config (
  key text primary key,
  value text not null
);
insert into private.app_config (key, value) values ('rls_secret', '<SUPABASE_RLS_SECRET> — replace with the value from your .env, keep this SQL private')
  on conflict (key) do update set value = excluded.value;

-- nobody outside the service role/owner can ever watch the secret table
revoke all on schema private from anon, authenticated;
revoke all on private.app_config from anon, authenticated;

drop policy if exists "anon full access on referrals" on public.referrals;
drop policy if exists "token-gated full access on referrals" on public.referrals;
create policy "token-gated full access on referrals"
  on public.referrals
  for all
  to anon, authenticated
  using (
    (select value from private.app_config where key = 'rls_secret')
      = coalesce(current_setting('request.headers', true)::json ->> 'x-crm-secret', '')
  )
  with check (
    (select value from private.app_config where key = 'rls_secret')
      = coalesce(current_setting('request.headers', true)::json ->> 'x-crm-secret', '')
  );

-- ============================================================
-- Hardening TODO (after next app release with Supabase Auth):
--  - require Supabase Auth login in the Electron main process
--    and issue role claims; replace the secret-gated policy
--    with role-scoped ones (admin sees all; franchisee sees
--    own downline only).
-- ============================================================
