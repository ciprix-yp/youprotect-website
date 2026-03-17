const fs = require('fs');

const files = [
  'src/components/global/GlobalPreFooterCTA.astro',
  'src/components/global/GlobalInnerHero.astro',
  'src/pages/produse/index.astro',
  'src/pages/index.astro',
  'src/pages/despre-noi.astro',
  'src/pages/cum-lucram.astro'
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace request_quote with /cere-oferta
  content = content.replace(/window\.YouProtectShortlist\?\.openLeadModal\(\{\s*intent:\s*'request_quote'[^}]*\}\)/g, "window.location.href='/cere-oferta'");
  
  // Replace all other intents with /programeaza-discutie
  content = content.replace(/window\.YouProtectShortlist\?\.openLeadModal\([^)]+\)/g, "window.location.href='/programeaza-discutie'");
  
  fs.writeFileSync(file, content);
  console.log('Updated ' + file);
});
