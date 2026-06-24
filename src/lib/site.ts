// Constante de site partajate (sursă unică de adevăr pentru NAP + schema).
// Folosite de BaseLayout.astro (JSON-LD) și Footer.astro ca să nu divergă.

export const SITE = {
  name: "You Protect",
  url: "https://youprotect.ro",
  // Imagine OG implicită la nivel de site (există în /public).
  defaultOgImage: "/hero-youprotect-highvis.jpg",
  telephone: "+40742226127",
  email: "office@youprotect.ro",
  address: {
    streetAddress: "Strada Careiului nr 11",
    addressLocality: "Vetiș",
    addressRegion: "Satu Mare",
    postalCode: "447355",
    addressCountry: "RO",
  },
  geo: { latitude: 47.7602, longitude: 22.8447 },
  // Zonele deservite — semnal GEO pentru local search.
  areaServed: ["Satu Mare", "Regiunea Nord-Vest", "România"],
  // Program (din Footer): L-V 09:00-17:00, weekend închis.
  openingHours: {
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    opens: "09:00",
    closes: "17:00",
  },
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
