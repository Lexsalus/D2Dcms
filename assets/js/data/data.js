// Wybór warstwy danych: 'supabase' (baza w chmurze) albo 'local' (tryb demo w przeglądarce).
// Domyślnie z config.js; strona startowa pozwala przełączyć na demo (localStorage fc.backend).
import { BACKEND } from '../core/config.js';

export const MODE = localStorage.getItem('fc.backend') || BACKEND;
let S;
try {
  S = MODE === 'supabase' ? await import('./store-sb.js') : await import('./store.js');
} catch (e) {
  console.error('Supabase niedostępny — tryb demo', e);
  S = await import('./store.js');
}
export default S;
export function setBackend(mode) { localStorage.setItem('fc.backend', mode); }
