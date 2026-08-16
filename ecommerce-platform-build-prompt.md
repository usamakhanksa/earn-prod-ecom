# Build Prompt: Multi-Vendor E-Commerce Platform (Country-Aware)

Copy everything below into Claude (or Claude Code) as a single message to generate the project in one pass.

---

## Project Goal

Build a responsive, multi-page frontend (with a lightweight backend/API layer) for a
multi-vendor e-commerce platform. The site detects the visitor's country automatically
and tailors the categories, products, and supplier options shown to that country.
It also supports supplier onboarding and an affiliate program.

## Tech Stack

- **Frontend:** React (Next.js — needed for server-side geo-detection and SEO-friendly routing)
- **Styling:** Tailwind CSS
- **Backend:** Node.js + Express (or Next.js API routes) — REST API
- **Database:** PostgreSQL (relational data: users, suppliers, products, orders, affiliates)
- **Auth:** JWT-based sessions, role-based access (`customer`, `supplier`, `affiliate`, `admin`)
- **Geo-detection:** IP-based lookup (e.g. ipapi.co / ip-api.com / MaxMind GeoLite2) with a
  manual country-switcher as fallback for VPN users or blocked lookups
- **Payments:** Stripe Connect (marketplace payouts to suppliers) — stub only, do not wire live keys

## Pages & Routes

| Route | Purpose |
|---|---|
| `/` | Home — hero, featured categories (country-filtered), trending products, CTA banners |
| `/about` | About — mission, team, how the marketplace works |
| `/contact` | Contact form (name, email, subject, message) → posts to `/api/contact` |
| `/products` | Full catalog, filterable by category, price, supplier, country availability |
| `/products/[category]` | Category-specific listing |
| `/product/[id]` | Single product detail page (images, price, supplier info, shipping-to-country estimate) |
| `/suppliers/register` | Supplier sign-up form (business name, country, tax ID, product categories offered) |
| `/suppliers/login` | Supplier login |
| `/suppliers/dashboard` | Supplier's own product listings, orders, payout status |
| `/affiliates/register` | Affiliate sign-up (payout method, promotional channels) |
| `/affiliates/dashboard` | Affiliate's referral link, click/conversion stats, earnings |
| `/login` / `/register` | Customer auth |
| `/account` | Customer profile, order history |
| `/cart` & `/checkout` | Standard cart/checkout flow |

## Country Detection Logic

1. On first visit, call the geo API server-side (in `getServerSideProps` or middleware) using
   the request IP to resolve a country code (ISO 3166-1 alpha-2).
2. Store the result in a cookie (`user_country`) so it persists across pages without re-querying.
3. Show a small dismissible banner: "Shopping in **[Country]**? [Change]" — clicking opens a
   manual country selector that overrides the cookie.
4. All product/category queries take `country` as a filter parameter so the catalog reflects
   only items available/shippable to that country.
5. Gracefully degrade to a default country (e.g. "Global") if geo-lookup fails.

## Data Models (minimum viable schema)

- **User**: id, email, password_hash, role, country, created_at
- **Supplier**: id, user_id, business_name, country, tax_id, verified (bool), categories[]
- **Product**: id, supplier_id, title, description, price, currency, category_id, countries_available[], stock, images[]
- **Category**: id, name, parent_id (for subcategories), countries_available[]
- **Affiliate**: id, user_id, referral_code, payout_method, country
- **Order**: id, customer_id, product_id, supplier_id, affiliate_id (nullable), status, country, created_at
- **ContactMessage**: id, name, email, subject, message, created_at

## API Endpoints to Scaffold

- `GET /api/geo` — resolve visitor's country from IP
- `GET /api/categories?country=XX`
- `GET /api/products?country=XX&category=YY`
- `GET /api/products/:id`
- `POST /api/contact`
- `POST /api/suppliers/register`
- `POST /api/suppliers/login`
- `GET /api/suppliers/me/products` (auth required)
- `POST /api/affiliates/register`
- `GET /api/affiliates/me/stats` (auth required)
- `POST /api/auth/register` / `POST /api/auth/login`

## Design Requirements

- Clean, modern e-commerce aesthetic — avoid generic default Tailwind/Bootstrap look;
  pick an intentional color palette and type scale.
- Mobile-first responsive layout; test breakpoints at 375px, 768px, 1280px.
- Product cards: image, title, price in local currency, supplier name, country-availability badge.
- Forms (supplier/affiliate registration, contact) need inline validation and clear error states.
- Include loading and empty states for country-filtered product lists (e.g. "No products
  currently ship to your country — browse global catalog instead").

## Non-Functional Requirements

- Passwords hashed with bcrypt; never store plaintext.
- Basic rate-limiting on auth and contact endpoints.
- GDPR-style cookie consent banner for the country-detection cookie.
- Seed the database with ~15 sample products across 3–4 categories and 3 countries so the
  app is demoable immediately after setup.
- Include a `README.md` with setup steps, `.env.example`, and how to run migrations/seed data.

## Deliverable

A working local dev environment (`npm run dev` starts both frontend and API), seeded with
sample data, covering every page and route listed above, with country detection functioning
end-to-end (real geo-lookup + manual override).
