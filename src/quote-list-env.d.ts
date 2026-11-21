// window.ypQuoteList: lista de ofertă, pusă de src/scripts/quote-list.ts pe fiecare pagină (vezi src/lib/quote-list.js).
interface Window {
  ypQuoteList?: import('./lib/quote-list.js').QuoteListApi;
}
