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

    // Some endpoints might return 204 No Content
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

async function setup() {
    try {
        console.log('1. Creating website_products collection...');
        await request('/collections', 'POST', {
            collection: 'website_products',
            meta: {
                icon: 'shopping_bag',
                note: 'Clean view catalog for website',
                display_template: '{{name}}',
                hidden: false,
                singleton: false
            },
            schema: {
                name: 'website_products'
            },
            fields: [
                {
                    field: 'id',
                    type: 'uuid',
                    meta: { hidden: true, readonly: true, interface: 'input' },
                    schema: { is_primary_key: true, has_auto_increment: false }
                }
            ]
        });
        console.log('Collection created.');

        const fields = [
            {
                field: 'name', type: 'string',
                meta: { interface: 'input', display: 'raw' }, schema: { is_nullable: false }
            },
            {
                field: 'slug', type: 'string',
                meta: { interface: 'input', display: 'raw' }, schema: { is_nullable: false }
            },
            {
                field: 'description', type: 'text',
                meta: { interface: 'input-rich-text-md', display: 'raw' }, schema: { is_nullable: true }
            },
            {
                field: 'base_price', type: 'decimal',
                meta: { interface: 'input', display: 'formatted-value' }, schema: { is_nullable: true }
            },
            {
                field: 'category_name', type: 'string',
                meta: { interface: 'input', display: 'raw' }, schema: { is_nullable: true }
            },
            {
                field: 'is_featured', type: 'boolean',
                meta: { interface: 'boolean', display: 'boolean' }, schema: { is_nullable: false, default_value: false }
            },
            {
                field: 'supplier_sku', type: 'string',
                meta: { interface: 'input', display: 'raw' }, schema: { is_nullable: true }
            },
            {
                field: 'cover_image_url', type: 'string',
                meta: { interface: 'input', display: 'raw' }, schema: { is_nullable: true }
            },
            {
                field: 'status', type: 'string',
                meta: { interface: 'select-dropdown', display: 'labels', options: { choices: [{ text: 'Published', value: 'published' }, { text: 'Draft', value: 'draft' }, { text: 'Archived', value: 'archived' }] } },
                schema: { is_nullable: false, default_value: 'draft' }
            }
        ];

        console.log('2. Adding fields...');
        for (const f of fields) {
            await request(`/fields/website_products`, 'POST', f);
            console.log(`Field ${f.field} added.`);
        }

        console.log('3. Setting Public permissions...');
        // Public role is null in the permissions API sometimes, but wait, there usually is a directus_roles table with public role UUID 
        // Wait, the API for permissions allows omit role or role: null for public. Let's try role: null.
        await request('/permissions', 'POST', {
            role: null,
            collection: 'website_products',
            action: 'read',
            permissions: {
                status: { _eq: 'published' }
            },
            fields: ['*']
        });
        console.log('Permissions set.');

        console.log('Setup Complete!');

    } catch (e) {
        console.error('Setup failed:', e.message);
    }
}

setup();
