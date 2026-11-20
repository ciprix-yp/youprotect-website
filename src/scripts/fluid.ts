// Fluiditate (20.11.2026, după skill-ul apple-design):
// 1. Poza produsului trece din card în fișa produsului (View Transitions între pagini, vezi global.css). Galeria din
//    fișă (#gallery-well) are mereu numele „product-photo”; la click pe un card, poza cardului primește același nume.
//    Întoarcerea (Înapoi) e în BaseLayout, inline în <head>: evenimentul pagereveal vine înaintea scripturilor de
//    aici. Un nume poate apărea o singură dată pe pagină, altfel browserul sare peste tranziție.
// 2. Pe iPhone, :active (butonul care se apasă vizibil) merge doar dacă pagina ascultă atingerile.
const NAME = 'product-photo';
const PRODUCT_PATH = /^\/produse\/([a-z0-9-]+)\/$/;

function productSlug(href: string): string | null {
  try {
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return null;
    return PRODUCT_PATH.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

function clearCardNames() {
  document.querySelectorAll<HTMLElement>('[data-vt-photo]').forEach((el) => {
    el.style.viewTransitionName = '';
  });
}

function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
}

// Dus: cardul apăsat (click simplu, nu tab nou) dă numele pozei lui.
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!link || link.target === '_blank') return;
  const slug = productSlug(link.href);
  if (!slug) return;
  const photo = link.closest('article')?.querySelector<HTMLElement>('[data-vt-photo]');
  if (!photo || photo.dataset.vtPhoto !== slug || !isVisible(photo)) return;
  clearCardNames();
  const gallery = document.getElementById('gallery-well');
  if (gallery) gallery.style.viewTransitionName = 'none';
  photo.style.viewTransitionName = NAME;
});

document.addEventListener('touchstart', () => {}, { passive: true });
