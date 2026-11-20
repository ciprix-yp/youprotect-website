// Unde se construiește site-ul. Cloudflare Pages setează CF_PAGES_BRANCH la build: „main” = youprotect.ro (producție);
// orice alt branch = preview (<branch>.youprotect-website.pages.dev). Local și în CI variabila lipsește.
export const isProductionBuild = () => process.env.CF_PAGES_BRANCH === 'main';
