---
name: frontend-website-rules
description: Enforce strict frontend website execution rules for visual parity and high-craft output. Use when building or editing frontend pages, matching reference images, running localhost screenshot loops, and applying anti-generic UI guardrails.
---

# Frontend Website Rules

## Always Do First

- Invoke the `frontend-design` skill before writing frontend code.

## Reference Matching

- If a reference image exists, match layout, spacing, typography, and color exactly.
- Do not add sections, features, or content not present in reference.
- Do not improve reference design.
- Use placeholders only where source assets are missing.
- Use `https://placehold.co/` for placeholder images.

## Localhost Requirement

- Always run and test from localhost.
- Never validate from `file:///`.
- Start server from project root with `node serve.mjs`.
- If server is already running, do not start a second server.

## Screenshot Loop

- Capture from localhost only: `node screenshot.mjs http://localhost:3000`.
- Optional labeled capture: `node screenshot.mjs http://localhost:3000 label`.
- Screenshots are saved in `./temporary screenshots/`.
- Run minimum two comparison rounds before stop.
- Compare: spacing, typography, colors, alignment, radius, shadows, image crop.
- Report specific diffs, then fix and re-capture.

## Output Defaults

- Default output is single `index.html` with inline styles unless user requests otherwise.
- For standalone pages use Tailwind CDN:
- `<script src="https://cdn.tailwindcss.com"></script>`
- Build mobile-first responsive layouts.

## Brand Assets

- Check `brand_assets/` before designing.
- If assets exist, use them instead of placeholders.
- If palette exists, use exact values.
- If logo exists, include it.

## Anti-Generic Guardrails

- Do not use default Tailwind blue/indigo as primary color.
- Do not use `transition-all`.
- Use distinct heading/body typography.
- Use layered shadows, not flat default shadows.
- Animate only `transform` and `opacity`.
- Add hover, focus-visible, and active states to every clickable element.
- Keep spacing consistent and intentional.
- Keep surface depth layered (base, elevated, floating).

## Hard Rules

- Do not add extra sections/features/content outside reference.
- Do not stop after one screenshot pass.
- Do not use `transition-all`.
- Do not use Tailwind blue/indigo as primary brand color.

## Validation Checklist

1. `frontend-design` invoked.
2. Localhost used.
3. Minimum two screenshot comparison rounds completed.
4. No hard-rule violations remain.
