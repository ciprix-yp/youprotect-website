// Cardurile din primul ecran se încarcă eager, restul lazy. Un rând de desktop are 4 carduri, două rânduri pe telefon
// (2 coloane) tot 4: primul card e poza LCP (fetchpriority high).
export const EAGER_CARDS = 4;

export function cardPriority(index: number): 'high' | 'eager' | undefined {
  if (index === 0) return 'high';
  return index < EAGER_CARDS ? 'eager' : undefined;
}
