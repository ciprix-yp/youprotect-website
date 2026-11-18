// Constante de site partajate (sursă unică de adevăr pentru NAP + schema).
// Folosite de BaseLayout.astro (JSON-LD) și Footer.astro ca să nu divergă.

export const SITE = {
  name: "You Protect",
  url: "https://youprotect.ro",
  // Imagine OG implicită la nivel de site (există în /public).
  defaultOgImage: "/hero-youprotect-highvis.jpg",
  telephone: "+40742226127",
  telephoneDisplay: "0742 226 127",
  email: "office@youprotect.ro",
  // Datele firmei, folosite în footer și în paginile legale.
  // CUI confirmat de Ciprian pe 16.11.2026 (cel de pe facturi); footer-ul vechi avea greșit RO 46387843.
  legal: {
    name: "You Protect SRL",
    cui: "RO46294850",
    regCom: "J30/624/2022",
    euid: "ROONRC.J30/624/2022",
  },
  address: {
    streetAddress: "Strada Careiului nr. 45, Parc Industrial Areli",
    addressLocality: "Vetiș",
    addressRegion: "Satu Mare",
    postalCode: "447355",
    addressCountry: "RO",
  },
  geo: { latitude: 47.7848561, longitude: 22.8030222 },
  // Zonele deservite — semnal GEO pentru local search.
  areaServed: ["Satu Mare", "Regiunea Nord-Vest", "România"],
  // Program (din Footer): L-V 09:00-17:00, weekend închis.
  openingHours: {
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    opens: "09:00",
    closes: "17:00",
  },
} as const;

// Oferta „testare fără riscuri”, afișată pe fișele de produs. Confirmată de You Protect pe 11.11.2026.
// Afișată prin components/global/RiskFreeTesting.astro: caseta (`text`) pe fișele de produs, rândul scurt (`short`)
// pe homepage, în catalog și pe paginile cu formular.
export const RISK_FREE_TESTING = {
  title: "Testezi fără riscuri",
  text: "Înainte de decizia finală, poți testa produsele cu echipa ta, în condiții reale de lucru. Testarea are garanția banilor înapoi în 90 de zile.",
  short: "Încerci produsele cu echipa ta, în condiții reale de lucru, cu garanția banilor înapoi în 90 de zile.",
  href: "/cum-lucram/#testare",
  linkLabel: "Vezi cum lucrăm",
} as const;

// Profiluri sociale pentru footer + schema `sameAs`.
// Gol acum (doar WhatsApp). Completează cu URL-uri reale când există;
// codul le afișează automat și le adaugă în sameAs.
export const SOCIAL_LINKS: { facebook?: string; instagram?: string; linkedin?: string } = {
  // facebook: "https://www.facebook.com/...",
  // instagram: "https://www.instagram.com/...",
  // linkedin: "https://www.linkedin.com/company/...",
};

export const sameAs = Object.values(SOCIAL_LINKS).filter(Boolean) as string[];

// Măsurare (D-2026-11-18-02). Paginile legale și bannerul se generează din aceste valori, ca să descrie exact ce rulează.
//   ga4Id: ID-ul de măsurare Google Analytics 4 („G-…”). E public, apare în pagină. Gol = GA oprit și fără banner.
//          La build se poate înlocui cu PUBLIC_GA4_ID (de exemplu un ID de test, local).
//   cloudflareWebAnalytics: true după ce Web Analytics e pornit în Cloudflare Pages (scriptul îl injectează Cloudflare,
//          fără cookie-uri). Verificare: pagina publicată conține „static.cloudflareinsights.com/beacon.min.js”.
const GA4_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;
const ga4Id = (import.meta.env.PUBLIC_GA4_ID as string | undefined) || "";

export const ANALYTICS = {
  ga4Id: GA4_ID_PATTERN.test(ga4Id) ? ga4Id : "",
  cloudflareWebAnalytics: false,
  // Alegerea din banner, în localStorage. Se cere din nou după 6 luni.
  consentKey: "yp_consent",
  consentMaxAgeDays: 182,
  // Cookie-urile Google Analytics expiră după 13 luni (nu după 2 ani, cât e implicit).
  gaCookieMaxAgeDays: 395,
};
