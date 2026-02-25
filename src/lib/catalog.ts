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

interface ProductConformityRow {
  standard: string | null;
  protection_level: string | null;
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  shortDescription: string;
  featured: boolean;
  categoryName: string;
  categorySlug: string;
  producatorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogProductDetail extends CatalogProduct {
  benefits: string[];
  conformity: string[];
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

function toCatalogProduct(row: CatalogProductRow): CatalogProduct {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? '',
    shortDescription: row.short_description ?? row.description ?? '',
    featured: Boolean(row.featured),
    categoryName: row.category_name ?? 'Catalog general',
    categorySlug: row.category_slug ?? '',
    producatorName: row.producator_name ?? 'You Protect',
    createdAt: normalizeDate(row.created_at),
    updatedAt: normalizeDate(row.updated_at),
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown database error';
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

    return {
      products: rows.map(toCatalogProduct),
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

function buildConformityRows(rows: ProductConformityRow[]): string[] {
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

    const product = toCatalogProduct(productRow);

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

    let conformity: string[] = [];
    try {
      const conformityRows = await queryRows<ProductConformityRow>(
        `
        SELECT standard, protection_level
        FROM product_specs
        WHERE product_id = $1
        `,
        [product.id]
      );

      conformity = buildConformityRows(conformityRows);
    } catch {
      conformity = [];
    }

    return {
      product: {
        ...product,
        benefits,
        conformity,
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
