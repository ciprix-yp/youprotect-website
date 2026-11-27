// Structura RIFF a unui WebP: folosită de testele care verifică lipsa metadatelor (EXIF, XMP, profil ICC).
export const FORBIDDEN_CHUNKS = new Set(['EXIF', 'XMP ', 'ICCP']);

/** Numele chunk-urilor RIFF dintr-un WebP; aruncă dacă fișierul nu e RIFF/WEBP sau chunk-urile ies din fișier. */
export function riffChunks(buffer) {
  if (buffer.length < 12 || buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WEBP') {
    throw new Error('nu e RIFF/WEBP');
  }
  const names = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32LE(offset + 4);
    names.push(buffer.toString('latin1', offset, offset + 4));
    offset += 8 + size + (size % 2); // chunk-urile sunt aliniate la 2 octeți
  }
  if (offset !== buffer.length) throw new Error('chunk în afara fișierului');
  return names;
}
