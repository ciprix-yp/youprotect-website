# Deploy Flow (Git + Cloudflare)

Obiectiv: la fiecare iteratie avem build live online pentru verificare desktop + mobile.

## Regula de release pe iteratie

1. Task-ul trece `pm review <TASK_ID>`.
2. Commit local pe branch-ul curent.
3. Push pe GitHub.
4. Cloudflare Pages (Git integration) face deploy automat pentru commit.
5. Validare live (mobile + desktop).
6. Dupa validare, task-ul poate fi inchis cu `pm close <TASK_ID>`.

## Setup one-time

1. Cloudflare Pages project
- Proiect conectat la repo GitHub `ciprix-yp/youprotect-website`.
- `main` este production branch.
- Auto deployments: enabled.
- Production domain: `https://youprotect-website.pages.dev`.

2. CI checks in GitHub Actions (fara deploy)
- Fisier: `/Users/homefolder/youprotect-website/.github/workflows/ci-build.yml`
- Ruleaza build la push/PR pentru validare tehnica.

3. Local auth (doar pentru deploy manual direct, optional)
- `npx wrangler login`
- optional: `export CF_PAGES_PROJECT='youprotect-website'`

## Comenzi uzuale

Build + deploy direct manual (optional, wrangler):
`npm run cf:deploy`

Release standard iteratie (review + push; Cloudflare deploy automat):
`npm run release:iteration -- WP-001`

Release iteratie + deploy direct manual suplimentar:
`npm run release:iteration -- WP-001 --direct-cloudflare`

## Nota de operare

In setup-ul actual, deploy-ul Cloudflare vine din integrarea Git nativa, nu din GitHub Actions.
