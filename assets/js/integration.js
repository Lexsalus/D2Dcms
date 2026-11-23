// Integracja z zewnętrznym CRM: webhooki zdarzeń + format wymiany danych (docs/INTEGRACJA.md).
// W prototypie wysyła przeglądarka; docelowo ten sam format wysyła funkcja serwerowa (bez ograniczeń CORS).

export const EVENTS = ['visit.submitted', 'visit.decided', 'assignment.created'];
export const SCHEMA_VERSION = 1;

// Wysyłka POST z JSON-em. Gdy serwer CRM nie obsługuje CORS, ponawiamy w trybie no-cors
// (dane dochodzą, ale przeglądarka nie widzi odpowiedzi → status „sent”).
export async function deliver(url, token, event, data) {
  const body = JSON.stringify({ event, schema: SCHEMA_VERSION, sentAt: new Date().toISOString(), source: 'fieldcheck', data });
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST', mode: 'cors',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-FieldCheck-Token': token } : {}) },
      body,
    });
    return { ok: res.ok, status: res.ok ? 'ok' : 'error', code: res.status, ms: Date.now() - started };
  } catch {
    try {
      await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body });
      return { ok: true, status: 'sent', code: 0, ms: Date.now() - started };
    } catch (e) {
      return { ok: false, status: 'error', code: 0, ms: Date.now() - started, error: String(e.message || e) };
    }
  }
}

// Wspólny kształt rekordu wizyty dla webhooków i eksportu JSON
export function visitRecord(v, p, a, user) {
  return {
    id: v.id,
    external_id: p?.external_id || null,
    property: p ? { id: p.id, street: p.street, building: p.building, unit: p.unit || null, zip: p.zip, city: p.city, lat: p.lat, lng: p.lng } : null,
    assignment: a ? { id: a.id, due: a.due || null, status: a.status } : null,
    rep: user ? { id: user.id, name: user.name } : null,
    started_at: v.startedAt ? new Date(v.startedAt).toISOString() : null,
    submitted_at: v.submittedAt ? new Date(v.submittedAt).toISOString() : null,
    status: v.status,
    outcome: v.outcome || null,
    note: v.note || null,
    gps: v.gps ? { lat: v.gps.lat, lng: v.gps.lng, accuracy: v.gps.acc } : null,
    reasons: (v.reasons || []).map(r => r.code),
    decision: v.decision || null,
    decision_reason: v.decisionReason || null,
    decided_at: v.decidedAt ? new Date(v.decidedAt).toISOString() : null,
  };
}
