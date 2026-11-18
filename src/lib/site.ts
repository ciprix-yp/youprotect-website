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
  // Nr. Reg. Com. verificat la ANAF pe 18.11.2026 (site-ul avea greșit J30/624/2022).
  // Adresa: Ciprian confirmă Careiului 45 (Parc Industrial Areli); ANAF arăta încă nr. 11 ca sediu social pe 18.11.2026.
  legal: {
    name: "You Protect SRL",
    cui: "RO46294850",
    regCom: "J30/646/2022",
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

// EUID = prefixul ONRC + numărul de înregistrare.
export const LEGAL_EUID = `ROONRC.${SITE.legal.regCom}`;

// Oferta „testare fără riscuri”, afișată pe fișele de produs. Confirmată de You Protect pe 11.11.2026; condițiile
// (D-2026-11-18-03) sunt pe /testare-fara-riscuri/: banii se întorc dacă produsele NU ies mai eficiente financiar
// ȘI clientul nu e mulțumit. Nu scurta textele până la „garanția banilor înapoi” fără condiție.
// Afișată prin components/global/RiskFreeTesting.astro: caseta (`text`) pe fișele de produs, rândul scurt (`short`)
// pe homepage, în catalog și pe paginile cu formular.
export const RISK_FREE_TESTING = {
  title: "Testezi fără riscuri",
  text: "Înainte să echipezi toată firma, testezi produsele cu 3–5 oameni pe rol, 90 de zile, în condiții reale de lucru. Măsurăm împreună cât rezistă și cât te costă pe zi de purtare. Pe rolurile unde nu ies mai eficiente decât ce folosești acum și nu ești mulțumit, îți dăm banii înapoi integral.",
  short: "Încerci produsele cu echipa ta 90 de zile și măsurăm împreună costul real. Pe rolurile unde nu ies mai eficiente și nu ești mulțumit, îți dăm banii înapoi.",
  href: "/testare-fara-riscuri/",
  linkLabel: "Vezi condițiile",
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
//          La build se poate înlocui cu PUBLIC_GA4_ID (de exemplu un ID de test, local). GA se încarcă doar după acord.
//   cloudflareWebAnalytics: true după ce Web Analytics e pornit în Cloudflare Pages (scriptul îl injectează Cloudflare,
//          fără cookie-uri). Verificare: pagina publicată conține „static.cloudflareinsights.com/beacon.min.js”.
const GA4_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;
// Proprietatea GA4 a youprotect.ro (18.11.2026).
const GA4_MEASUREMENT_ID = "G-TV8YEFYQD5";
const ga4Id = (import.meta.env.PUBLIC_GA4_ID as string | undefined) || GA4_MEASUREMENT_ID;

export const ANALYTICS = {
  ga4Id: GA4_ID_PATTERN.test(ga4Id) ? ga4Id : "",
  cloudflareWebAnalytics: true, // pornit în Cloudflare Pages; beacon verificat pe youprotect.ro, 18.11.2026
  // Alegerea din banner, în localStorage. Se cere din nou după 6 luni.
  consentKey: "yp_consent",
  consentMaxAgeDays: 182,
  // Cookie-urile Google Analytics expiră după 13 luni (nu după 2 ani, cât e implicit).
  gaCookieMaxAgeDays: 395,
};
