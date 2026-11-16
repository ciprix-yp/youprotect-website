// Animațiile la scroll (AOS), din pachetul npm `aos`, cu aceleași setări ca înainte.
import AOS from "aos";

AOS.init({
  // Fără animații pentru cine a cerut „reduce motion” din sistem: AOS scoate data-aos și totul e vizibil imediat.
  disable: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  once: true, // animăm o singură dată, la prima apariție
  mirror: false,
  offset: 100,
  duration: 800,
  easing: "ease-out-cubic",
  delay: 50,
});

document.addEventListener("astro:after-swap", () => AOS.refreshHard());
