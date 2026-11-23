// Konfiguracja backendu. Klucz publiczny (publishable) może być w repo — dostęp do danych chronią zasady RLS w bazie.
// NIGDY nie wpisuj tu klucza secret / service_role.
export const SUPABASE_URL = 'https://qbtbquzylmgheaqlljhg.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_A2c0DZZSzQP1moButE3xuA_9Qu-v2EX';
// 'local' = prototyp na danych w przeglądarce, 'supabase' = baza w chmurze (po uruchomieniu skryptów z /supabase)
export const BACKEND = 'local';
