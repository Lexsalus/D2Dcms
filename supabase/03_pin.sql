-- FieldCheck · 03_pin.sql — logowanie handlowca PIN-em (jak w wersji demo).
-- PIN przechowywany jako hash bcrypt w tabeli bez dostępu z przeglądarki; sprawdza go tylko funkcja serwerowa rep-login.
-- Po 5 błędnych próbach konto blokuje się na 15 minut. Konto działa na jednym telefonie.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.rep_pins (
  user_id uuid primary key references public.profiles on delete cascade,
  pin_hash text not null,
  failed int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.rep_pins enable row level security;   -- brak polityk = brak dostępu dla anon/authenticated
revoke all on public.rep_pins from anon, authenticated;

-- ustawienie PIN-u (wywołuje funkcja serwerowa admin-users z kluczem serwisowym)
create or replace function public.fc_set_pin(p_user uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'pin_format'; end if;
  insert into rep_pins (user_id, pin_hash) values (p_user, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, failed = 0, locked_until = null, updated_at = now();
end $$;

-- sprawdzenie loginu + PIN-u + urządzenia (wywołuje funkcja serwerowa rep-login)
create or replace function public.fc_check_pin(p_login text, p_pin text, p_device text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p profiles; r rep_pins;
begin
  select * into p from profiles where lower(email) = lower(trim(p_login)) and role = 'rep';
  if p.id is null then raise exception 'bad_login'; end if;
  if not p.active then raise exception 'account_inactive'; end if;
  select * into r from rep_pins where user_id = p.id;
  if r.user_id is null then raise exception 'bad_login'; end if;
  if r.locked_until is not null and r.locked_until > now() then raise exception 'pin_locked'; end if;
  if r.pin_hash <> extensions.crypt(p_pin, r.pin_hash) then
    update rep_pins set failed = failed + 1,
      locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' else null end where user_id = p.id;
    insert into audit_log (user_id, action, object) values (p.id, 'pin_failed', coalesce(p_device, ''));
    raise exception 'bad_login';
  end if;
  if p.device_id is not null and p.device_id <> p_device then raise exception 'device_bound'; end if;
  update rep_pins set failed = 0, locked_until = null where user_id = p.id;
  if p.device_id is null then update profiles set device_id = p_device where id = p.id; end if;
  return jsonb_build_object('user_id', p.id, 'email', p.email, 'name', p.name);
end $$;

revoke execute on function public.fc_set_pin(uuid, text), public.fc_check_pin(text, text, text) from public, anon, authenticated;

select 'logowanie PIN gotowe' as wynik;
