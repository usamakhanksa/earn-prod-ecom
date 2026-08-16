# ReplyRight — Local & Production Setup Guide

Follow this in order. Skipping steps is why "it doesn't work" happens.

## 0. Prerequisites
- Node.js 18+ and npm installed (`node -v` to check)
- A GitHub account (for deploying to Vercel)
- Accounts, all free to start: [Supabase](https://supabase.com),
  [Stripe](https://stripe.com), [Anthropic Console](https://console.anthropic.com),
  [Vercel](https://vercel.com)

## 1. Get your API keys and IDs before touching code
You cannot run this app without these. Get them first so setup isn't
interrupted.

- **Anthropic**: console.anthropic.com → API Keys → create one. This is
  `ANTHROPIC_API_KEY`. Note: this costs real money per request once you're
  past any free credits — check current pricing on the Anthropic pricing page
  before launching publicly.
- **Supabase**: create a new project → Project Settings → API. Copy the
  Project URL (`NEXT_PUBLIC_SUPABASE_URL`), the `anon` public key
  (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), and the `service_role` secret key
  (`SUPABASE_SERVICE_ROLE_KEY`, never expose this to the browser).
- **Stripe**: Dashboard → Developers → API keys → copy the secret key
  (`STRIPE_SECRET_KEY`, use the **test** key while developing). Then Products →
  create a $15/month recurring product → copy its Price ID
  (`STRIPE_PRICE_ID_PRO`).

## 2. Run it locally
```bash
git clone <your-repo-url>
cd replyright
npm install
cp .env.example .env.local   # then fill in every value from step 1
npm run dev
```
Open http://localhost:3000. If auth or billing don't work locally, it's almost
always a missing or mistyped env var — check `.env.local` first before
anything else.

## 3. Set up the Stripe webhook locally (needed to test billing)
```bash
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
This prints a webhook signing secret starting with `whsec_` — put that in
`STRIPE_WEBHOOK_SECRET` in `.env.local` and restart `npm run dev`.

## 4. Set up the Supabase database
In the Supabase SQL editor, run the schema from `BUILD_PROMPT.md` (profiles
and generations tables), or ask Claude Code to generate and run the migration
for you as part of the build.

## 5. Deploy to production (Vercel)
```bash
npm i -g vercel
vercel login
vercel
```
Then in the Vercel project dashboard → Settings → Environment Variables, add
every variable from `.env.local` — using your **live** Stripe keys this time,
not test keys, and your production `NEXT_PUBLIC_APP_URL` (your real domain).

## 6. Point Stripe's live webhook at production
Stripe Dashboard → Developers → Webhooks → Add endpoint →
`https://yourdomain.com/api/webhooks/stripe` → select
`checkout.session.completed` and `customer.subscription.deleted` → copy the
new signing secret into Vercel's `STRIPE_WEBHOOK_SECRET`.

## 7. Before you tell anyone this exists, verify:
- [ ] Sign up with a real email, confirm the magic link/confirmation works
- [ ] Generate a reply as a free user, confirm the 5/month limit actually stops you
- [ ] Upgrade via Stripe Checkout using a real card in **test mode**, confirm
      your plan updates to "pro" in the database
- [ ] Cancel the subscription via the Customer Portal, confirm it downgrades you
- [ ] Switch Stripe to live mode only after all of the above pass

## Common failure points
- **"Unauthorized" errors**: usually the service role key vs anon key mixed up
  — service role is server-only, anon is client-only.
- **Webhook not firing in production**: the endpoint URL or signing secret is
  wrong, or you forgot to redeploy after adding env vars.
- **Free limit not enforcing**: it's checking usage client-side instead of
  server-side — this must be verified in the API route, not just the UI.
