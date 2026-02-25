# CLAUDE.MD - You Protect Website

## Project Overview

**You Protect** is a B2B e-commerce website for protective equipment and personalized uniforms for Romanian companies. The site is built as a static site generator (SSG) using Astro with React components for interactive elements.

**Business Model:**
- B2B focus: Selling protective equipment and uniforms to companies
- Lead generation with personalized quotes
- Future integration with n8n for product management
- Target market: Romania (Romanian language)

---

## Tech Stack

- **Framework:** Astro 4.16.18 (SSG)
- **UI Components:** React 19.2.3
- **Styling:** Tailwind CSS 3.4.17
- **Language:** Romanian (ro)
- **Deployment:** Static build

### Key Dependencies
```json
{
  "@astrojs/react": "^4.4.2",
  "@astrojs/tailwind": "^5.1.2",
  "astro": "^4.16.18",
  "react": "^19.2.3",
  "react-dom": "^19.2.3",
  "tailwindcss": "^3.4.17"
}
```

### Development Commands
```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run preview  # Preview production build
```

---

## Project Structure

```
youprotect-website/
├── src/
│   ├── components/
│   │   ├── global/
│   │   │   ├── Header.astro        # Fixed header with nav & CTA
│   │   │   └── Footer.astro        # Footer with contact info & WhatsApp
│   │   ├── ProductCard.astro       # Product display card
│   │   └── LeadModal.tsx           # React modal for lead capture (with validation)
│   ├── layouts/
│   │   └── BaseLayout.astro        # Main layout wrapper
│   ├── pages/
│   │   ├── index.astro             # Homepage (7 sections)
│   │   ├── despre-noi.astro        # About page (placeholders)
│   │   ├── cum-lucram.astro        # How We Work page (3-step process)
│   │   └── produse/                # Products catalog (to be built)
│   └── styles/
│       └── global.css              # Global styles & Tailwind
├── package.json
├── astro.config.mjs
├── tailwind.config.mjs
└── README.md
```

---

## Design System

### Brand Colors (Tailwind)
- **Yellow (Primary):** `yp-yellow` - #E3FC02 (Neon yellow, high contrast)
- **Black:** `yp-black` - #0A0A0A (Background, text)
- **Gray:** `yp-gray` - #2E2E2E (Secondary background)
- **White:** `yp-white` - #FFFFFF (Text on dark)
- **Green (Accent):** `yp-green` - #0F766E (Dark teal, CTA borders, accents)

### Typography
- **Heading Font:** Montserrat (Bold, 700)
- **Body Font:** Lato (Regular, 400)
- **Accent Font:** Playfair Display (Italic) - used for quotes/testimonials

### Tailwind Classes
```css
.font-heading  /* Montserrat Bold */
.font-body     /* Lato Regular */
.font-accent   /* Playfair Display Italic */

.text-yp-yellow
.text-yp-black
.text-yp-gray
.text-yp-white
.text-yp-green

.bg-yp-yellow
.bg-yp-black
.bg-yp-gray
```

### Design Patterns
- **Dark theme:** Black background with yellow accents
- **High contrast:** Yellow CTAs on black backgrounds
- **Fixed header:** Sticky navigation with blur backdrop
- **Responsive:** Mobile-first, with hamburger menu
- **Pattern overlays:** SVG patterns on hero sections (low opacity)

---

## Pages Overview

### 1. Homepage (`/` - index.astro)
**Status:** ✅ Complete structure, ⚠️ Needs copy

7 main sections:
1. **Hero Section** - Full-screen with headline, subheading, 2 CTAs
2. **Problem Section** - 3 pain points (cards with emojis)
3. **Solution Section** - 2 benefits (alternating image/text layout)
4. **Featured Products** - 4 product cards (mock data)
5. **Trust Indicators** - Stats + certifications/partnerships
6. **Testimonials** - 3 client testimonials (5-star ratings)
7. **Final CTA** - Yellow section with lead form trigger

**TODOs:**
- [ ] Replace all `[COMPLETEAZĂ: ...]` placeholders with real copy
- [ ] Add actual stats (years, clients, products delivered)
- [ ] Add real testimonials with client names/companies
- [ ] Replace placeholder images with real photos
- [ ] Connect "Cere Ofertă" buttons to LeadModal component

---

### 2. About Page (`/despre-noi` - despre-noi.astro)
**Status:** ⚠️ Placeholder content only

**Current Sections:**
- Team section (placeholder)
- Mission section (placeholder)
- Values section (placeholder)

**TODOs:**
- [ ] Write company story and mission
- [ ] Add team member profiles (if applicable)
- [ ] Define company values
- [ ] Add photos and real content

---

### 3. How We Work Page (`/cum-lucram` - cum-lucram.astro)
**Status:** ✅ Production-ready copy

**Sections:**
1. Hero with headline
2. 3-step process (visual timeline)
3. Filter logic explanation (n8n integration)
4. Final CTA

**No TODOs** - Content is complete.

---

### 4. Products Catalog (`/produse/`)
**Status:** ❌ Not yet built

**Planned Features:**
- Product listing page with filters
- Individual product detail pages
- Integration with n8n API for product data
- Categories: Îmbrăcăminte, Încălțăminte, Echipamente & Accesorii

**TODOs:**
- [ ] Build `/produse` listing page
- [ ] Build `/produse/[slug]` detail pages
- [ ] Integrate n8n API
- [ ] Implement filtering system

---

## Components Overview

### Global Components

#### `Header.astro`
- Fixed position, backdrop blur
- Logo + navigation (Acasă, Despre Noi, Cum Lucrăm, Produse)
- Desktop nav + mobile hamburger menu
- "Cere Ofertă" CTA button
- Active link highlighting

#### `Footer.astro`
- Contact information (email, phone)
- WhatsApp floating button
- Social links (if applicable)
- Copyright

---

### Reusable Components

#### `ProductCard.astro`
**Props:**
- `nume` - Product name
- `categorie` - Product category
- `descriereScurta` - Short description
- `imaginePrincipala` - Image URL
- `tipProdus` - Array of product types/tags
- `slug` - URL slug (for linking to detail page)

**Styling:**
- Rounded card with hover effects
- Image + category badge
- Name + short description
- Displays product type tags
- Links to `/produse/[slug]` (to be built)

---

#### `LeadModal.tsx` (React)
**Status:** ✅ Complete with validation

**Features:**
- React modal for lead capture
- Form validation (email, phone format)
- Fields: Name, Company, Email, Phone, Message
- Close on outside click or "X" button
- Tailwind styling matching brand colors

**TODOs:**
- [ ] Connect form to backend (n8n webhook or email service)
- [ ] Add success/error messages
- [ ] Integrate with Header/Homepage CTA buttons

---

## Current State & Priorities

### ✅ Completed
- [x] Global Header & Footer
- [x] Homepage structure (7 sections)
- [x] ProductCard component
- [ ] LeadModal component (referit în cod, dar fișierul `LeadModal.tsx` nu există încă)
- [x] How We Work page with production copy
- [x] About page skeleton
- [x] Design system (colors, fonts, Tailwind config)

### 🚧 In Progress / Next Steps
1. **Homepage Copy** - Replace all `[COMPLETEAZĂ: ...]` placeholders
2. **LeadModal Integration** - Connect CTAs to modal, add backend
3. **Product Catalog** - Build `/produse` pages and n8n integration
4. **About Page Content** - Write real copy for team/mission/values
5. **SEO & Meta Tags** - Add proper meta descriptions, OG tags
6. **Real Images** - Replace Unsplash placeholders with client photos
7. **Testing** - Cross-browser, mobile responsiveness
8. **Analytics** - Add Google Analytics or similar
9. **Performance** - Optimize images, lazy loading

---

## API Integration (Planned)

### n8n Integration
The site will integrate with n8n for:
- **Product Management** - Fetch product catalog from n8n API
- **Lead Capture** - Send form submissions to n8n webhook
- **Order Processing** - Handle quote requests

**API Structure (to be defined):**
```typescript
// Product data structure
interface Product {
  id: number;
  nume: string;
  slug: string;
  categorie: string;
  descriereScurta: string;
  descriereLunga?: string;
  imaginePrincipala: string;
  imagini?: string[];
  tipProdus: string[];
  pret?: number;
  featured: boolean;
}
```

---

## Key Patterns & Conventions

### File Naming
- **Pages:** Lowercase, kebab-case (e.g., `despre-noi.astro`)
- **Components:** PascalCase (e.g., `ProductCard.astro`, `LeadModal.tsx`)
- **Layouts:** PascalCase (e.g., `BaseLayout.astro`)

### Code Style
- **Astro components** for static content
- **React components** for interactive elements (modals, forms)
- **Tailwind** for all styling (no custom CSS unless necessary)
- **TypeScript** for type safety in React components

### Content Placeholders
- All missing copy marked with `[COMPLETEAZĂ: ...]`
- Placeholder images use Unsplash (to be replaced)
- Mock product data in `index.astro` (to be replaced with API)

### CTAs & Lead Generation
- Primary CTA: "Cere Ofertă Personalizată"
- Secondary CTA: "Vezi Produsele" (links to catalog)
- WhatsApp button in footer for quick contact
- All CTAs should trigger LeadModal (to be connected)

---

## SEO & Meta

### Current Setup
- HTML lang="ro"
- Meta description in BaseLayout
- Title format: `{Page Title} | You Protect`
- Favicon placeholder

### TODOs
- [ ] Add Open Graph meta tags
- [ ] Add Twitter Card meta tags
- [ ] Create real favicon/logo files
- [ ] Add structured data (JSON-LD) for products
- [ ] Add sitemap.xml
- [ ] Add robots.txt

---

## Deployment Notes

### Build Process
```bash
npm run build  # Generates static site in dist/
```

### Hosting Requirements
- Static hosting (Netlify, Vercel, Cloudflare Pages, etc.)
- No server-side rendering needed (SSG only)
- Environment variables for n8n API endpoints (to be added)

---

## Git Workflow

**Current Branch:** `claude/update-claude-md-Kq9i9`

**Recent Commits:**
1. Add global Header & Footer
2. Complete homepage with all 7 sections
3. Add reusable components (ProductCard, LeadModal)
4. Add How We Work page with production copy
5. Add About page with placeholders

**Branch Strategy:**
- Develop on feature branches starting with `claude/`
- Push to origin with `-u` flag
- Create PRs when features are complete

---

## Notes for Claude

### When Working on This Project:
1. **Always check for placeholders** - Look for `[COMPLETEAZĂ: ...]` markers
2. **Use brand colors** - Stick to the design system (yp-yellow, yp-black, etc.)
3. **Responsive design** - Test mobile/tablet/desktop layouts
4. **Component reusability** - Prefer components over inline code
5. **Romanian language** - All user-facing text should be in Romanian
6. **B2B focus** - Content should speak to business decision-makers
7. **Lead generation** - Primary goal is capturing leads, not direct sales

### Common Tasks:
- **Adding new pages:** Use `BaseLayout.astro` wrapper
- **Adding interactive elements:** Use React components with Astro integration
- **Updating navigation:** Edit `Header.astro`
- **Styling:** Use Tailwind classes, avoid custom CSS
- **Images:** Use Unsplash for now, plan to replace with real photos

---

## Questions for Stakeholder

Before continuing development, clarify:
1. **Copy/Content:** Do you have the content ready for placeholders?
2. **n8n API:** Is the n8n workflow ready? What's the API structure?
3. **Product Data:** How many products? Categories? Custom fields?
4. **Testimonials:** Do you have real client testimonials + permission to use?
5. **Images:** Do you have brand photos/product photos, or should we use stock?
6. **Branding:** Is the logo final? Any additional brand guidelines?
7. **Contact Info:** What's the company email, phone, address for footer?
8. **Social Media:** What social profiles to link in footer?

---

**Last Updated:** 2026-01-20
**Version:** 1.0.0
