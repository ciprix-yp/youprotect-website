import pg from 'pg';

const { Pool } = pg;

type CatalogMode = 'live' | 'degraded';

interface CatalogProductRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  short_description: string | null;
  featured: boolean | null;
  category_name: string | null;
  category_slug: string | null;
  producator_name: string | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
}

interface ProductBenefitRow {
  benefit_text: string | null;
}

interface ProductSpecRow {
  standard: string | null;
  protection_level: string | null;
  sizes: unknown;
}

interface ProductImageRow {
  url: string | null;
  type: string | null;
  alt_text: string | null;
}

interface SupplierImageRow {
  url: string | null;
  image_type: string | null;
  alt_text: string | null;
  is_primary: boolean | null;
  display_order: number | null;
}

interface SupplierVariantRow {
  size_display: string | null;
  size_eu: string | null;
  color_name: string | null;
  color_hex: string | null;
  is_available: boolean | null;
}

interface SupplierMetaRow {
  showroom_product_id: string | null;
  season_label: string | null;
  season_label_alt: string | null;
  is_bestseller_text: string | null;
  is_new_text: string | null;
}

interface CatalogProductImageMapRow {
  product_id: string | null;
  url: string | null;
  type: string | null;
}

interface CatalogSupplierImageMapRow {
  showroom_product_id: string | null;
  url: string | null;
  image_type: string | null;
  is_primary: boolean | null;
  display_order: number | null;
}

export interface CatalogColorSwatch {
  name: string;
  hex: string | null;
}

export interface CatalogProductImage {
  url: string;
  alt: string;
  type: string;
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  shortDescription: string;
  thumbnailUrl: string | null;
  featured: boolean;
  categoryName: string;
  categorySlug: string;
  producatorName: string;
  createdAt: string;
  updatedAt: string;
  merchandisingTags: string[];
}

export interface CatalogProductDetail extends CatalogProduct {
  benefits: string[];
  conformity: string[];
  images: CatalogProductImage[];
  sizeAvailabilityLabel: string | null;
  sizeValues: string[];
  colorSwatches: CatalogColorSwatch[];
  guarantee: string;
}

export interface CatalogProductsResult {
  products: CatalogProduct[];
  mode: CatalogMode;
  warning: string | null;
}

export interface CatalogProductDetailResult {
  product: CatalogProductDetail | null;
  mode: CatalogMode;
  warning: string | null;
}

const LETTER_SIZE_ORDER = [
  'XXS',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  '2XL',
  '3XL',
  '4XL',
  '5XL',
  '6XL',
  '7XL',
  '8XL',
];

let pool: pg.Pool | null = null;

function getDatabaseUrl(): string | null {
  const metaEnvValue = import.meta.env.DATABASE_URL;
  const processEnvValue = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env?.DATABASE_URL;
  const rawValue = metaEnvValue ?? processEnvValue;

  if (typeof rawValue !== 'string') {
    return null;
  }

  const value = rawValue.trim();
  return value.length > 0 ? value : null;
}

function shouldUseSsl(databaseUrl: string): boolean {
  try {
    const parsed = new URL(databaseUrl);
    return parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1';
  } catch {
    return true;
  }
}

function getPool(): pg.Pool {
  if (pool) {
    return pool;
  }

  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is missing.');
  }

  pool = new Pool({
    connectionString: databaseUrl,
    ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 4_000,
    idleTimeoutMillis: 5_000,
    max: 3,
  });

  return pool;
}

async function queryRows<T extends Record<string, unknown>>(
  sqlText: string,
  params: readonly unknown[] = []
): Promise<T[]> {
  const dbPool = getPool();
  const response = await dbPool.query<T>(sqlText, [...params]);
  return response.rows;
}

function normalizeDate(value: string | Date | null): string {
  if (!value) {
    return new Date(0).toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(0).toISOString();
  }

  return parsed.toISOString();
}

function safeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeHexColor(value: unknown): string | null {
  const raw = safeText(value);
  if (!raw) {
    return null;
  }

  const normalized = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#[0-9A-Fa-f]{6}$/.test(normalized) ? normalized.toUpperCase() : null;
}

function normalizeImageUrl(value: unknown): string | null {
  const raw = safeText(value);
  if (!raw) {
    return null;
  }

  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) {
    return raw;
  }

  return null;
}

function toCatalogProduct(row: CatalogProductRow): CatalogProduct {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? '',
    shortDescription: row.short_description ?? row.description ?? '',
    thumbnailUrl: null,
    featured: Boolean(row.featured),
    categoryName: row.category_name ?? 'Catalog general',
    categorySlug: row.category_slug ?? '',
    producatorName: row.producator_name ?? 'You Protect',
    createdAt: normalizeDate(row.created_at),
    updatedAt: normalizeDate(row.updated_at),
    merchandisingTags: [],
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown database error';
}

function parseBooleanLike(value: string | null): boolean | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'da'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'nu'].includes(normalized)) {
    return false;
  }

  return null;
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function sortMerchandisingTags(tags: string[]): string[] {
  const order = ['Bestseller', 'Noutate'];
  return [...uniqueValues(tags)].sort((left, right) => {
    const leftIndex = order.indexOf(left);
    const rightIndex = order.indexOf(right);

    if (leftIndex !== -1 || rightIndex !== -1) {
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    }

    return left.localeCompare(right, 'ro-RO');
  });
}

function buildDefaultTags(product: CatalogProduct): string[] {
  const tags: string[] = [];

  if (product.featured) {
    tags.push('Bestseller');
  }

  const createdAt = new Date(product.createdAt).getTime();
  if (!Number.isNaN(createdAt)) {
    const ageInDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
    if (ageInDays <= 45) {
      tags.push('Noutate');
    }
  }

  return sortMerchandisingTags(tags);
}

function mergeTags(...collections: string[][]): string[] {
  const merged: string[] = [];
  for (const collection of collections) {
    merged.push(...collection);
  }
  return sortMerchandisingTags(merged);
}

async function fetchSupplierMetaByShowroomIds(ids: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();

  if (ids.length === 0) {
    return result;
  }

  try {
    const rows = await queryRows<SupplierMetaRow>(
      `
      SELECT
        showroom_product_id,
        supplier_metadata->>'season' AS season_label,
        supplier_metadata->>'season_label' AS season_label_alt,
        supplier_metadata->>'is_bestseller' AS is_bestseller_text,
        supplier_metadata->>'is_new' AS is_new_text
      FROM supplier_products
      WHERE showroom_product_id = ANY($1::uuid[])
      `,
      [ids]
    );

    for (const row of rows) {
      const productId = safeText(row.showroom_product_id);
      if (!productId) {
        continue;
      }

      const rowTags: string[] = [];
      if (parseBooleanLike(row.is_bestseller_text) === true) {
        rowTags.push('Bestseller');
      }
      if (parseBooleanLike(row.is_new_text) === true) {
        rowTags.push('Noutate');
      }

      const season = safeText(row.season_label) ?? safeText(row.season_label_alt);
      if (season) {
        rowTags.push(`Sezon: ${season}`);
      }

      const existingTags = result.get(productId) ?? [];
      result.set(productId, mergeTags(existingTags, rowTags));
    }
  } catch {
    return result;
  }

  return result;
}

async function fetchCatalogThumbnailsByShowroomIds(ids: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  if (ids.length === 0) {
    return result;
  }

  try {
    const directRows = await queryRows<CatalogProductImageMapRow>(
      `
      SELECT
        product_id,
        url,
        type
      FROM product_images
      WHERE product_id = ANY($1::uuid[])
      ORDER BY
        product_id,
        CASE WHEN type IN ('primary', 'main', 'hero') THEN 0 ELSE 1 END,
        id ASC
      `,
      [ids]
    );

    for (const row of directRows) {
      const productId = safeText(row.product_id);
      const url = normalizeImageUrl(row.url);
      if (!productId || !url || result.has(productId)) {
        continue;
      }
      result.set(productId, url);
    }
  } catch {
    // Keep fallback flow from supplier images.
  }

  const missingIds = ids.filter((id) => !result.has(id));
  if (missingIds.length === 0) {
    return result;
  }

  try {
    const supplierRows = await queryRows<CatalogSupplierImageMapRow>(
      `
      SELECT
        sp.showroom_product_id,
        COALESCE(spi.url_large, spi.url_medium, spi.url_thumbnail, spi.url_original) AS url,
        spi.image_type,
        spi.is_primary,
        spi.display_order
      FROM supplier_product_images spi
      JOIN supplier_products sp ON sp.id = spi.product_id
      WHERE sp.showroom_product_id = ANY($1::uuid[])
      ORDER BY
        sp.showroom_product_id,
        spi.is_primary DESC,
        spi.display_order ASC,
        spi.id ASC
      `,
      [missingIds]
    );

    for (const row of supplierRows) {
      const productId = safeText(row.showroom_product_id);
      const url = normalizeImageUrl(row.url);
      if (!productId || !url || result.has(productId)) {
        continue;
      }
      result.set(productId, url);
    }
  } catch {
    return result;
  }

  return result;
}

function normalizeLetterSize(value: string): string {
  const normalized = value.toUpperCase().replace(/\s+/g, '');
  const directMap: Record<string, string> = {
    XXL: '2XL',
    XXXL: '3XL',
    XXXXL: '4XL',
    XXXXXL: '5XL',
    XXXXXXL: '6XL',
    XXXXXXXL: '7XL',
    XXXXXXXXL: '8XL',
  };

  if (directMap[normalized]) {
    return directMap[normalized];
  }

  return normalized;
}

function normalizeSizeToken(value: unknown): string | null {
  const raw = safeText(String(value ?? ''));
  if (!raw) {
    return null;
  }

  let token = raw.replace(/\s+/g, ' ').trim().toUpperCase();
  token = token.replace(/\bM[AĂ]RIMEA?\b/g, '').replace(/\s+/g, ' ').trim();

  if (!token || token.length > 30) {
    return null;
  }

  if (/^\d{2}(?:[.,]\d+)?$/.test(token)) {
    return token.replace(',', '.');
  }

  if (/^(XXS|XS|S|M|L|XL|XXL|XXXL|[2-9]XL|ONE SIZE|UNI|UNISIZE)$/i.test(token)) {
    return normalizeLetterSize(token);
  }

  if (/^[A-Z0-9]{1,8}\s*[-/]\s*[A-Z0-9]{1,8}$/.test(token)) {
    const [left, right] = token.split(/[-/]/).map((part) => normalizeLetterSize(part.trim()));
    return `${left}-${right}`;
  }

  return null;
}

function collectLeafValues(input: unknown, output: string[]): void {
  if (input === null || input === undefined) {
    return;
  }

  if (typeof input === 'string' || typeof input === 'number') {
    output.push(String(input));
    return;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      collectLeafValues(item, output);
    }
    return;
  }

  if (typeof input === 'object') {
    for (const value of Object.values(input as Record<string, unknown>)) {
      collectLeafValues(value, output);
    }
  }
}

function extractSizeValuesFromUnknown(input: unknown): string[] {
  const leaves: string[] = [];
  collectLeafValues(input, leaves);

  const values: string[] = [];
  for (const leaf of leaves) {
    const chunks = leaf.split(/[;,|]/g);
    for (const chunk of chunks) {
      const token = normalizeSizeToken(chunk);
      if (token) {
        values.push(token);
      }
    }
  }

  return uniqueValues(values);
}

function sizeOrderValue(size: string): number {
  if (/^\d{2}(?:\.\d+)?$/.test(size)) {
    return Number(size);
  }

  const letterIndex = LETTER_SIZE_ORDER.indexOf(size);
  if (letterIndex !== -1) {
    return 1000 + letterIndex;
  }

  return 9999;
}

function sortSizeValues(values: string[]): string[] {
  return [...values].sort((left, right) => {
    const leftOrder = sizeOrderValue(left);
    const rightOrder = sizeOrderValue(right);

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.localeCompare(right, 'ro-RO');
  });
}

function buildSizeAvailabilityLabel(sizeValues: string[]): string | null {
  if (sizeValues.length === 0) {
    return null;
  }

  const explicitRange = sizeValues.find((value) => value.includes('-'));
  if (explicitRange) {
    return explicitRange;
  }

  const numericValues = sizeValues
    .filter((value) => /^\d{2}(?:\.\d+)?$/.test(value))
    .map((value) => Number(value));

  if (numericValues.length >= 2) {
    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);
    return `${min}-${max}`;
  }

  const letterValues = sizeValues.filter((value) => LETTER_SIZE_ORDER.includes(value));
  if (letterValues.length >= 2) {
    const ordered = sortSizeValues(letterValues);
    return `${ordered[0]}-${ordered[ordered.length - 1]}`;
  }

  return sizeValues.join(', ');
}

function dedupeColorSwatches(swatches: CatalogColorSwatch[]): CatalogColorSwatch[] {
  const map = new Map<string, CatalogColorSwatch>();

  for (const swatch of swatches) {
    const name = safeText(swatch.name) ?? 'Fara nume';
    const hex = normalizeHexColor(swatch.hex);
    const key = `${name.toLowerCase()}::${hex ?? ''}`;

    if (!map.has(key)) {
      map.set(key, { name, hex });
    }
  }

  return [...map.values()].sort((left, right) => left.name.localeCompare(right.name, 'ro-RO'));
}

function extractColorSwatchesFromUnknown(input: unknown): CatalogColorSwatch[] {
  const extracted: CatalogColorSwatch[] = [];

  const walk = (value: unknown) => {
    if (value === null || value === undefined || typeof value !== 'object') {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    const record = value as Record<string, unknown>;
    const colorName =
      safeText(record.color_name) ?? safeText(record.color) ?? safeText(record.colour) ?? null;
    const colorHex = normalizeHexColor(record.color_hex) ?? normalizeHexColor(record.hex);

    if (colorName || colorHex) {
      extracted.push({
        name: colorName ?? 'Nespecificata',
        hex: colorHex,
      });
    }

    Object.values(record).forEach(walk);
  };

  walk(input);
  return dedupeColorSwatches(extracted);
}

function buildConformityRows(rows: ProductSpecRow[]): string[] {
  const values = new Set<string>();

  for (const row of rows) {
    const standard = row.standard?.trim();
    const level = row.protection_level?.trim();

    if (standard) {
      values.add(standard);
    }

    if (level) {
      values.add(level);
    }
  }

  return [...values];
}

function buildProductImages(
  productImages: ProductImageRow[],
  supplierImages: SupplierImageRow[],
  productName: string
): CatalogProductImage[] {
  const output: CatalogProductImage[] = [];
  const seen = new Set<string>();

  const pushImage = (urlValue: unknown, altValue: unknown, typeValue: unknown) => {
    const url = normalizeImageUrl(urlValue);
    if (!url || seen.has(url)) {
      return;
    }

    seen.add(url);
    output.push({
      url,
      alt: safeText(altValue) ?? `${productName} - imagine produs`,
      type: safeText(typeValue) ?? 'product',
    });
  };

  for (const row of productImages) {
    pushImage(row.url, row.alt_text, row.type);
    if (output.length >= 5) {
      return output;
    }
  }

  for (const row of supplierImages) {
    pushImage(row.url, row.alt_text, row.image_type);
    if (output.length >= 5) {
      return output;
    }
  }

  if (output.length === 0) {
    output.push({
      url: '/hero-youprotect-highvis.jpg',
      alt: `${productName} - imagine de prezentare`,
      type: 'fallback',
    });
  }

  return output;
}

function buildColorSwatchesFromVariants(rows: SupplierVariantRow[]): CatalogColorSwatch[] {
  const swatches = rows.map((row) => ({
    name: safeText(row.color_name) ?? 'Nespecificata',
    hex: normalizeHexColor(row.color_hex),
  }));

  return dedupeColorSwatches(swatches);
}

export async function getCatalogProducts(): Promise<CatalogProductsResult> {
  try {
    const rows = await queryRows<CatalogProductRow>(
      `
      SELECT
        id,
        slug,
        name,
        description,
        short_description,
        featured,
        category_name,
        category_slug,
        producator_name,
        created_at,
        updated_at
      FROM vw_catalog_products
      ORDER BY featured DESC, name ASC
      `
    );

    const products = rows.map(toCatalogProduct);
    const ids = products.map((product) => product.id);
    const supplierMetaMap = await fetchSupplierMetaByShowroomIds(ids);
    const thumbnailMap = await fetchCatalogThumbnailsByShowroomIds(ids);

    const enrichedProducts = products.map((product) => {
      const defaultTags = buildDefaultTags(product);
      const supplierTags = supplierMetaMap.get(product.id) ?? [];

      return {
        ...product,
        thumbnailUrl: thumbnailMap.get(product.id) ?? null,
        merchandisingTags: mergeTags(defaultTags, supplierTags),
      };
    });

    return {
      products: enrichedProducts,
      mode: 'live',
      warning: null,
    };
  } catch (error) {
    return {
      products: [],
      mode: 'degraded',
      warning: errorMessage(error),
    };
  }
}

export async function getCatalogProductDetailBySlug(slug: string): Promise<CatalogProductDetailResult> {
  try {
    const products = await queryRows<CatalogProductRow>(
      `
      SELECT
        id,
        slug,
        name,
        description,
        short_description,
        featured,
        category_name,
        category_slug,
        producator_name,
        created_at,
        updated_at
      FROM vw_catalog_products
      WHERE slug = $1
      LIMIT 1
      `,
      [slug]
    );

    const productRow = products[0];

    if (!productRow) {
      return {
        product: null,
        mode: 'live',
        warning: null,
      };
    }

    const baseProduct = toCatalogProduct(productRow);
    const supplierMetaMap = await fetchSupplierMetaByShowroomIds([baseProduct.id]);
    const product = {
      ...baseProduct,
      merchandisingTags: mergeTags(
        buildDefaultTags(baseProduct),
        supplierMetaMap.get(baseProduct.id) ?? []
      ),
    };

    let benefits: string[] = [];
    try {
      const benefitRows = await queryRows<ProductBenefitRow>(
        `
        SELECT benefit_text
        FROM product_benefits
        WHERE product_id = $1
        ORDER BY benefit_text ASC
        LIMIT 8
        `,
        [product.id]
      );

      benefits = benefitRows
        .map((row) => row.benefit_text?.trim() ?? '')
        .filter((value) => value.length > 0);
    } catch {
      benefits = [];
    }

    let specRows: ProductSpecRow[] = [];
    try {
      specRows = await queryRows<ProductSpecRow>(
        `
        SELECT standard, protection_level, sizes
        FROM product_specs
        WHERE product_id = $1
        `,
        [product.id]
      );
    } catch {
      specRows = [];
    }

    const conformity = buildConformityRows(specRows);

    let directImages: ProductImageRow[] = [];
    try {
      directImages = await queryRows<ProductImageRow>(
        `
        SELECT url, type, alt_text
        FROM product_images
        WHERE product_id = $1
        ORDER BY
          CASE WHEN type IN ('primary', 'main', 'hero') THEN 0 ELSE 1 END,
          type ASC,
          id ASC
        LIMIT 8
        `,
        [product.id]
      );
    } catch {
      directImages = [];
    }

    let supplierImages: SupplierImageRow[] = [];
    try {
      supplierImages = await queryRows<SupplierImageRow>(
        `
        SELECT
          COALESCE(spi.url_large, spi.url_medium, spi.url_thumbnail, spi.url_original) AS url,
          spi.image_type,
          spi.alt_text,
          spi.is_primary,
          spi.display_order
        FROM supplier_product_images spi
        JOIN supplier_products sp ON sp.id = spi.product_id
        WHERE sp.showroom_product_id = $1
        ORDER BY spi.is_primary DESC, spi.display_order ASC, spi.id ASC
        LIMIT 8
        `,
        [product.id]
      );
    } catch {
      supplierImages = [];
    }

    let variantRows: SupplierVariantRow[] = [];
    try {
      variantRows = await queryRows<SupplierVariantRow>(
        `
        SELECT
          spv.size_display,
          spv.size_eu,
          spv.color_name,
          spv.color_hex,
          spv.is_available
        FROM supplier_product_variants spv
        JOIN supplier_products sp ON sp.id = spv.product_id
        WHERE sp.showroom_product_id = $1
          AND (spv.is_available IS TRUE OR spv.is_available IS NULL)
        ORDER BY spv.color_name NULLS LAST, spv.size_display NULLS LAST
        LIMIT 200
        `,
        [product.id]
      );
    } catch {
      variantRows = [];
    }

    const sizeValuesFromSpecs = specRows.flatMap((row) => extractSizeValuesFromUnknown(row.sizes));
    const sizeValuesFromVariants = variantRows
      .map((row) => safeText(row.size_display) ?? safeText(row.size_eu))
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizeSizeToken(value))
      .filter((value): value is string => Boolean(value));

    const sizeValues = sortSizeValues(uniqueValues([...sizeValuesFromSpecs, ...sizeValuesFromVariants]));
    const sizeAvailabilityLabel = buildSizeAvailabilityLabel(sizeValues);

    const variantSwatches = buildColorSwatchesFromVariants(variantRows);
    const specSwatches = specRows.flatMap((row) => extractColorSwatchesFromUnknown(row.sizes));
    // Canonical source for shades is supplier variants; specs are fallback only.
    const colorSwatches =
      variantSwatches.length > 0 ? variantSwatches : dedupeColorSwatches(specSwatches);

    return {
      product: {
        ...product,
        benefits,
        conformity,
        images: buildProductImages(directImages, supplierImages, product.name),
        sizeAvailabilityLabel,
        sizeValues,
        colorSwatches,
        guarantee:
          'Conditiile de garantie sunt confirmate in oferta personalizata, in functie de tipul de utilizare.',
      },
      mode: 'live',
      warning: null,
    };
  } catch (error) {
    return {
      product: null,
      mode: 'degraded',
      warning: errorMessage(error),
    };
  }
}
