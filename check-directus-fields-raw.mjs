import fetch from 'node-fetch';

async function test() {
    try {
        const url = 'https://directus-production-711b.up.railway.app/items/website_products?filter[status][_eq]=published&limit=1&fields=*.*.*';
        const response = await fetch(url);
        const data = await response.json();
        console.dir(data.data[0], { depth: null });
    } catch (e) {
        console.error('Fetch error:', e);
    }
}
test();
