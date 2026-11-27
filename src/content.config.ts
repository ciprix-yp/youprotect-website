import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { productSchema } from './lib/product-schema.ts';

// Fișierele din src/content/products/ sunt generate de scripts/catalog/assemble_*.py; schema e în src/lib/product-schema.ts.
const products = defineCollection({
  // ID-ul intrării = numele fișierului fără .json (slug-ul paginii).
  loader: glob({ pattern: '*.json', base: './src/content/products' }),
  schema: productSchema,
});

export const collections = { products };
