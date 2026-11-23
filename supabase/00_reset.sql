-- FieldCheck · 00_reset.sql
-- UWAGA: usuwa WSZYSTKIE tabele, widoki, funkcje i typy wyliczeniowe ze schematu public.
-- Obiekty należące do rozszerzeń (np. PostGIS) zostają. Uruchom w Supabase → SQL Editor.

do $$
declare r record;
begin
  -- widoki
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  loop execute format('drop view if exists public.%I cascade', r.relname); end loop;

  -- tabele
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  loop execute format('drop table if exists public.%I cascade', r.relname); end loop;

  -- funkcje
  for r in
    select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop execute format('drop function if exists %s cascade', r.f); end loop;

  -- typy wyliczeniowe
  for r in
    select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype = 'e'
      and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e')
  loop execute format('drop type if exists public.%I cascade', r.typname); end loop;
end $$;

-- wyzwalacze na auth.users założone wcześniej przez ten projekt
drop trigger if exists on_auth_user_created on auth.users;

-- Użytkowników logowania (Authentication → Users) i pliki w Storage usuń ręcznie w panelu,
-- jeśli też mają zniknąć — Supabase nie pozwala kasować plików Storage zapytaniem SQL.

select 'public wyczyszczony' as wynik;
