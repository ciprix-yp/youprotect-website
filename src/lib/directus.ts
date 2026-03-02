import { createDirectus, rest, readItems, readItem } from '@directus/sdk';

export interface WebsiteProduct {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    base_price: number | null;
    category_name: string | null;
    is_featured: boolean;
    supplier_sku: string | null;
    cover_image_url: string | null;
    status: 'published' | 'draft' | 'archived';
    size_range: string[] | null;
    color_options: { name: string; hex: string }[] | null;
    materials: string[] | null;
    certifications: string[] | null;
    seasonality: string | null;
    key_benefits: string[] | null;
    industry: string | null;
}

interface CustomSchema {
    website_products: WebsiteProduct[];
}

const directusUrl = import.meta.env.DIRECTUS_URL || 'https://directus-production-711b.up.railway.app';

export const directus = createDirectus<CustomSchema>(directusUrl).with(rest());

export async function getDirectusProducts() {
    try {
        const products = await directus.request(
            readItems('website_products', {
                filter: {
                    status: { _eq: 'published' }
                },
                limit: -1
            })
        );
        return products;
    } catch (error) {
        console.error('Error fetching products from Directus:', error);
        return [];
    }
}

export async function getDirectusProductBySlug(slug: string) {
    try {
        const products = await directus.request(
            readItems('website_products', {
                filter: {
                    slug: { _eq: slug },
                    status: { _eq: 'published' }
                },
                limit: 1
            })
        );
        return products.length > 0 ? products[0] : null;
    } catch (error) {
        console.error(`Error fetching product by slug ${slug} from Directus:`, error);
        return null;
    }
}
