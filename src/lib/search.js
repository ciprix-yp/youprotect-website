// Cheia de căutare din catalog (/produse/): fără diacritice (ș, ş, ț, ţ, ă, â, î), litere mici, doar litere și cifre
// separate de un spațiu. Vizitatorii scriu „caciula” și se așteaptă la „Căciulă”; „MASCOT® 21404” devine
// „mascot 21404”. Aceeași funcție e copiată în scriptul inline din src/pages/produse/index.astro (scriptul nu poate
// importa module); tests/search.test.mjs verifică să rămână identice.
export const searchKey = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('ro-RO')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Toate cuvintele căutate trebuie să apară (în orice ordine): „geaca mascot iarna”. */
export const matchesQuery = (key, query) => searchKey(query).split(' ').filter(Boolean).every((word) => key.includes(word));
