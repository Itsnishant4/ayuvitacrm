-- ============================================================
-- ayuvitaCRM — RLS hotfix: secret lookup was permission-denied
-- Root cause: the token-gated policy referenced private.app_config
-- inline. Policy expressions run with the INVOKING role's privileges
-- (anon), but all grants on private.* were revoked — so every
-- referrals query failed with 42501 permission denied.
-- Fix: expose the secret through a SECURITY DEFINER function, which
-- executes with the function owner's privileges.
-- Run this ONCE in Supabase Dashboard -> SQL Editor, then re-test the app.
-- ============================================================

create schema if not exists private;
create table if not exists private.app_config (
  key text primary key,
  value text not null
);

-- 1. SECURITY DEFINER getter (function owner can read private.app_config)
create or replace function private.get_rls_secret()
returns text
language sql
stable
security definer
set search_path = private
as $$
  select value from private.app_config where key = 'rls_secret'
$$;

revoke all on function private.get_rls_secret() from public;
grant execute on function private.get_rls_secret() to anon, authenticated;

-- 2. Swap the broken policies for ones using the definer function
drop policy if exists "anon full access on referrals" on public.referrals;
drop policy if exists "token-gated full access on referrals" on public.referrals;

create policy "token-gated full access on referrals"
  on public.referrals
  for all
  to anon, authenticated
  using (
    (select private.get_rls_secret())
      = coalesce(current_setting('request.headers', true)::json ->> 'x-crm-secret', '')
  )
  with check (
    (select private.get_rls_secret())
      = coalesce(current_setting('request.headers', true)::json ->> 'x-crm-secret', '')
  );

-- 3. Re-lock everything down
alter table public.referrals enable row level security;
revoke all on schema private from anon, authenticated;
revoke all on private.app_config from anon, authenticated;

-- Sanity check (should print the row count you expect, e.g. 279):
-- select count(*) from public.referrals;  -- run in a NEW query tab,
-- it uses the SQL editor's elevated role; to test as anon use the app.
