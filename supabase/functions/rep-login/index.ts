// FieldCheck · rep-login — logowanie handlowca loginem i PIN-em.
// Sprawdza PIN (fc_check_pin: hash, blokada po 5 próbach, jedno urządzenie) i zwraca jednorazowy token,
// który aplikacja wymienia na sesję (verifyOtp). Hasło konta pozostaje losowe i nikomu nieznane.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { login, pin, device } = await req.json();
    if (!login || !/^[0-9]{4,6}$/.test(String(pin || '')) || !device) return json({ error: 'bad_login' }, 400);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: who, error } = await admin.rpc('fc_check_pin', { p_login: login, p_pin: String(pin), p_device: String(device).slice(0, 40) });
    if (error) {
      const code = ['bad_login', 'account_inactive', 'pin_locked', 'device_bound'].find(c => error.message.includes(c)) || 'bad_login';
      return json({ error: code }, 401);
    }
    const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email: who.email });
    if (le) return json({ error: 'bad_login' }, 401);
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    await admin.from('audit_log').insert({ user_id: who.user_id, action: 'pin_login', object: String(device).slice(0, 40), ip });
    return json({ token_hash: link.properties.hashed_token, name: who.name, email: who.email });
  } catch (e) {
    return json({ error: 'bad_login' }, 400);
  }
});
