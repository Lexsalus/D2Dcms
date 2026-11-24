-- FieldCheck · 04_case_type.sql — rodzaj sprawy adresu (z kolumny „rodzaj_sprawy” w imporcie). Można uruchamiać ponownie.
alter table public.properties add column if not exists case_type text;
create index if not exists properties_case_type on public.properties (lower(case_type));

-- rodzaj sprawy także w danych wysyłanych do CRM (webhooki)
create or replace function public.fc_visit_json(v_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', v.id, 'external_id', p.external_id, 'case_type', p.case_type,
    'property', jsonb_build_object('id', p.id, 'street', p.street, 'building', p.building, 'unit', p.unit, 'zip', p.zip, 'city', p.city, 'lat', p.lat, 'lng', p.lng),
    'assignment', jsonb_build_object('id', a.id, 'due', a.due, 'status', a.status),
    'rep', jsonb_build_object('id', r.id, 'name', r.name),
    'started_at', v.started_at, 'submitted_at', v.submitted_at, 'status', v.status, 'outcome', v.outcome, 'note', v.note,
    'gps', case when v.gps_lat is null then null else jsonb_build_object('lat', v.gps_lat, 'lng', v.gps_lng, 'accuracy', v.gps_accuracy) end,
    'reasons', coalesce((select jsonb_agg(x ->> 'code') from jsonb_array_elements(v.reasons) x), '[]'),
    'decision', v.decision, 'decision_reason', v.decision_reason, 'decided_at', v.decided_at)
  from visits v join properties p on p.id = v.property_id join assignments a on a.id = v.assignment_id join profiles r on r.id = v.user_id
  where v.id = v_id
$$;

notify pgrst, 'reload schema';
select 'rodzaj sprawy gotowy' as wynik;
