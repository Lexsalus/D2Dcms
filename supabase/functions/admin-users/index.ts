// FieldCheck · admin-users — zakładanie i obsługa kont (wymaga klucza serwisowego, więc działa po stronie serwera).
// Wywołuje tylko zalogowany, aktywny administrator. Każda operacja trafia do dziennika (audit_log).
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
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

    // kto woła: weryfikacja tokenu sesji i roli w profiles
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: 'unauthorized' }, 401);
    const { data: me } = await admin.from('profiles').select('role, active, name').eq('id', user.id).single();
    if (me?.role !== 'admin' || !me.active) return json({ error: 'forbidden' }, 403);

    const b = await req.json();
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const audit = (action: string, object: string) => admin.from('audit_log').insert({ user_id: user.id, action, object, ip });

    if (b.action === 'create') {
      const role = ['admin', 'manager', 'rep'].includes(b.role) ? b.role : 'rep';
      const email = String(b.email || '').trim().toLowerCase();
      if (!email) return json({ error: 'email_required' }, 400);
      let uid: string; let link: string | null = null;
      if (role === 'rep') {
        // handlowiec: logowanie loginem i PIN-em; hasło konta losowe (nieużywane)
        if (!/^[0-9]{4,6}$/.test(String(b.pin || ''))) return json({ error: 'pin_format' }, 400);
        const password = crypto.randomUUID() + crypto.randomUUID();
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: b.name } });
        if (error) return json({ error: error.message }, 400);
        uid = data.user.id;
      } else {
        // admin / manager: link zaproszenia (hasło ustawia sam). Próbujemy wysłać e-mail; gdy domyślna poczta Supabase
        // nie może wysłać na ten adres, zwracamy link do przekazania osobie.
        const inv = await admin.auth.admin.inviteUserByEmail(email, { data: { name: b.name }, redirectTo: b.redirectTo });
        if (!inv.error) uid = inv.data.user.id;
        else {
          const { data, error } = await admin.auth.admin.generateLink({ type: 'invite', email, options: { data: { name: b.name }, redirectTo: b.redirectTo } });
          if (error) return json({ error: error.message }, 400);
          uid = data.user.id; link = data.properties.action_link;
        }
      }
      const { error: pe } = await admin.from('profiles').upsert({
        id: uid, email, name: b.name || email.split('@')[0], role, active: true, team: role === 'manager' ? (b.team || []) : [],
      });
      if (pe) return json({ error: pe.message }, 400);
      if (role === 'rep') {
        const { error: se } = await admin.rpc('fc_set_pin', { p_user: uid, p_pin: String(b.pin) });
        if (se) return json({ error: 'pin_format' }, 400);
      }
      await audit(`${role}_create`, email);
      return json({ ok: true, id: uid, invited: role !== 'rep', link });
    }

    if (b.action === 'set_pin') {
      const { error } = await admin.rpc('fc_set_pin', { p_user: b.user_id, p_pin: String(b.pin || '') });
      if (error) return json({ error: 'pin_format' }, 400);
      await audit('pin_set', b.user_id);
      return json({ ok: true });
    }

    if (b.action === 'set_password') {
      if (String(b.password || '').length < 8) return json({ error: 'password_too_short' }, 400);
      const { error } = await admin.auth.admin.updateUserById(b.user_id, { password: b.password });
      if (error) return json({ error: error.message }, 400);
      await audit('password_set', b.user_id);
      return json({ ok: true });
    }

    if (b.action === 'reinvite') {
      const { data: p } = await admin.from('profiles').select('email').eq('id', b.user_id).single();
      if (!p?.email) return json({ error: 'not_found' }, 404);
      // link odzyskiwania hasła: wysyłka e-mailem, a gdy się nie da — link do przekazania
      const r = await admin.auth.resetPasswordForEmail(p.email, { redirectTo: b.redirectTo });
      let link: string | null = null;
      if (r.error) {
        const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: p.email, options: { redirectTo: b.redirectTo } });
        if (error) return json({ error: error.message }, 400);
        link = data.properties.action_link;
      }
      await audit('password_reset_sent', p.email);
      return json({ ok: true, link });
    }

    if (b.action === 'delete') {
      if (b.user_id === user.id) return json({ error: 'cannot_delete_self' }, 400);
      const { error } = await admin.auth.admin.deleteUser(b.user_id);
      if (error) return json({ error: error.message }, 400);
      await audit('user_delete', b.user_id);
      return json({ ok: true });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
