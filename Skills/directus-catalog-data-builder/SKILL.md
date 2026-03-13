---
name: directus-catalog-data-builder
description: Create complete Directus-ready product records for website_products catalog fields. Use when preparing, enriching, validating, or batch-formatting data for Name, Slug, Description, Base Price, Category Name, Is Featured, Supplier SKU, Cover Image URL, Status, Size Range, Color Options, Materials, Certifications, Seasonality, and Key Benefits.
---

# Directus Catalog Data Builder

## Goal

Generate clean, publishable product data for Directus `website_products`, ready for import/paste in admin.

## Deterministic Tool in This Repo

- Input location (editable): `/Users/homefolder/youprotect-website/tmp/directus-catalog/input/products.csv`
- Output location (generated): `/Users/homefolder/youprotect-website/tmp/directus-catalog/output/directus-products.json`
- Directus-ready CSV (generated): `/Users/homefolder/youprotect-website/tmp/directus-catalog/output/directus-products-import.csv`
- Command (copy JSON to clipboard): `npm run directus:prepare`
- Command (without clipboard): `npm run directus:prepare:nocopy`
- Recreate template input file: `npm run directus:template`
- Important: collection `website_products` requires explicit `id` UUID on import.

## Supported Fields

- Name
- Slug
- Description
- Base Price
- Category Name
- Is Featured
- Supplier SKU
- Cover Image URL
- Status
- Size Range
- Color Options
- Materials
- Certifications
- Seasonality
- Key Benefits

## Field Rules

- `name`: clear commercial product name.
- `slug`: lowercase, hyphenated, url-safe, unique in batch.
- `description`: 2-5 practical B2B sentences, no unverifiable claims.
- `base_price`: decimal number or `null`.
- `category_name`: normalized category label.
- `is_featured`: boolean.
- `supplier_sku`: exact supplier code.
- `cover_image_url`: absolute `https://` url or `null`.
- `status`: `draft`, `published`, or `archived` (default `draft`).
- `size_range`: deduplicated array of size tokens.
- `color_options`: array of `{ "name": "...", "hex": "#RRGGBB" }`.
- `materials`: deduplicated array.
- `certifications`: exact standards/certs from source.
- `seasonality`: `vara`, `iarna`, `all-season`, or `null`.
- `key_benefits`: 3-7 short concrete benefits.

## Workflow

1. Collect source facts.
- Parse supplier sheet, technical sheet, media links.
- Mark missing/unknown values explicitly.

2. Draft product object.
- Fill all fields in Directus structure.
- Keep unknown optionals as `null` or empty arrays.

3. Normalize.
- Generate slug.
- Validate URL format.
- Validate hex colors.
- Deduplicate arrays.

4. Validate.
- Reject missing required core fields: `name`, `slug`, `supplier_sku`.
- Reject invalid enum values and malformed urls/hex.
- Reject invented certifications/prices.

5. Output.
- Return one object or array for batch import.
- Use strict JSON unless user asks CSV.

## Output Template

```json
{
  "name": "",
  "slug": "",
  "description": "",
  "base_price": null,
  "category_name": "",
  "is_featured": false,
  "supplier_sku": "",
  "cover_image_url": null,
  "status": "draft",
  "size_range": [],
  "color_options": [],
  "materials": [],
  "certifications": [],
  "seasonality": null,
  "key_benefits": []
}
```

## Color Options Template

```json
[
  { "name": "Galben HV", "hex": "#E4FF00" },
  { "name": "Negru", "hex": "#111111" }
]
```

## Hard Rules

- Do not invent certifications.
- Do not invent prices.
- Do not set `published` by default.
- Do not output duplicate slugs in the same batch.
- Do not output invalid urls or invalid hex values.

## Done Criteria

1. All requested fields present.
2. Output passes format and enum validation.
3. Records are ready for Directus import with no manual cleanup.
