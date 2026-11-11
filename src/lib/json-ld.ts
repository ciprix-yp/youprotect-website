// Serializează JSON-LD pentru <script type="application/ld+json">.
// Escapăm „<” ca un text din date (ex. „</script>” venit dintr-un feed) să nu poată închide tagul.
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
