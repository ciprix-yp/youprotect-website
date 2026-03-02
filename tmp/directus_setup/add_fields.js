const fetch = require('node-fetch');
const TOKEN = 'ciprix-admin-token-2026';
const URL = 'https://directus-production-711b.up.railway.app';

async function request(path, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${TOKEN}`,
            'Content-Type': 'application/json'
        }
    };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(`${URL}${path}`, options);

    if (res.status === 204) return null;

    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch (e) {
        console.error('Failed to parse json:', text);
        throw e;
    }

    if (!res.ok) {
        console.error(`Error on ${method} ${path}:`, JSON.stringify(json, null, 2));
        throw new Error(`API Error ${res.status}`);
    }
    return json;
}

async function addExtraFields() {
    try {
        const fields = [
            {
                field: 'size_range', type: 'json',
                meta: { interface: 'tags', display: 'labels' }, schema: { is_nullable: true }
            },
            {
                field: 'color_options', type: 'json',
                meta: { interface: 'list', display: 'raw' }, schema: { is_nullable: true }
            },
            {
                field: 'materials', type: 'json',
                meta: { interface: 'tags', display: 'labels' }, schema: { is_nullable: true }
            },
            {
                field: 'certifications', type: 'json',
                meta: { interface: 'tags', display: 'labels' }, schema: { is_nullable: true }
            },
            {
                field: 'seasonality', type: 'string',
                meta: { interface: 'select-dropdown', display: 'labels', options: { choices: [{ text: 'Vara', value: 'vara' }, { text: 'Iarna', value: 'iarna' }, { text: 'All-Season', value: 'all-season' }] } },
                schema: { is_nullable: true }
            },
            {
                field: 'key_benefits', type: 'json',
                meta: { interface: 'tags', display: 'labels' }, schema: { is_nullable: true }
            }
        ];

        console.log('Adding EXTRA fields to website_products...');
        for (const f of fields) {
            try {
                await request(`/fields/website_products`, 'POST', f);
                console.log(`Field ${f.field} added.`);
            } catch (e) {
                console.log(`Field ${f.field} probably exists or error:`, e.message);
            }
        }
        console.log('Done adding extra fields!');
    } catch (e) {
        console.error('Setup failed:', e.message);
    }
}

addExtraFields();
