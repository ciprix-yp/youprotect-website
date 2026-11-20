// Linkul spre conversația WhatsApp cu You Protect (0742 226 127), cu un mesaj precompletat. Pe orice pagină în afară
// de homepage, mesajul conține adresa paginii, ca echipa să știe de la ce produs sau pagină scrie omul (20.11.2026).
import { SITE } from './site.ts';

export const WHATSAPP_NUMBER = SITE.telephone.replace(/\D/g, '');

export function whatsappHref(pathname?: string, text?: string): string {
  const message =
    text ??
    (pathname && pathname !== '/'
      ? `Bună! Am o întrebare despre ${SITE.url}${pathname}`
      : 'Bună! Am o întrebare despre echipamentele de protecție.');
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
