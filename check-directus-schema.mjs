import fetch from 'node-fetch';

async function test() {
    try {
        const url = 'https://directus-production-711b.up.railway.app/fields/website_products';
        const response = await fetch(url);
        const data = await response.json();
        console.dir(data, { depth: null });
    } catch (e) {
        console.error('Fetch error:', e);
    }
}
test();
