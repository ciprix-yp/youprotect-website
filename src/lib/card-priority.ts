// LCP pe paginile de categorie și de marcă: doar primul card din grilă e eager + fetchpriority high (poza LCP, 600x750).
// Măsurat local (Chrome real, 390x844 DPR3, 1,6 Mbps/150 ms, CPU 4x, mediana din 5, față de build-ul fără poze pe model):
// 4 carduri eager (+5…+23%) concurează cu CSS-ul și fonturile pe 1,6 Mbps; 2 eager (+4…+15%); doar primul (+3…+8%).
// Hub-ul /produse/ (grila e sub linia de plutire) nu are niciun card eager.
export const EAGER_CARDS = 1;

export function cardPriority(index: number): 'high' | undefined {
  return index < EAGER_CARDS ? 'high' : undefined;
}
