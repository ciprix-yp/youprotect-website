import { createDirectus, rest, readItems } from '@directus/sdk';
import fetch from 'node-fetch';

Object.assign(globalThis, { fetch });

const directusUrl = 'https://directus-production-711b.up.railway.app';
export const directus = createDirectus(directusUrl).with(rest());

async function test() {
    try {
        const directusData = await directus.request(
            readItems('website_products', {
                filter: { status: { _eq: 'published' } },
                limit: 1,
                fields: ['*', '*.*']
            })
        );
        console.dir(directusData[0], { depth: null });
    } catch (e) {
        console.error('Error in mapping Directus products:', e);
    }
}
test();
