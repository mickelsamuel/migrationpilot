# MigrationPilot — Production Setup Checklist

Everything the code needs from external services before the app works in production. The codebase is complete — these are the manual steps that can't be automated.

---

## 1. Generate Your Signing Secret

Run this and save the output — you'll use it in both Vercel AND GitHub secrets:

```bash
openssl rand -hex 32
```

Keep this value private. It's the HMAC key that makes license keys unforgeable. The same secret must be used in:
- Vercel env var `MIGRATIONPILOT_SIGNING_SECRET` (webhook generates keys)
- GitHub repo secret `MIGRATIONPILOT_SIGNING_SECRET` (npm publish bakes it into CLI)

---

## 2. Stripe Setup (Required for payments)

1. **Create a Stripe account** at https://stripe.com (if not already done)
2. **Create 3 Products + Prices** in Stripe Dashboard:

   | Product | Price | Lookup Key | Metadata |
   |---------|-------|------------|----------|
   | MigrationPilot Pro | $29/month, recurring | `migrationpilot_pro_monthly` | `tier` = `pro` |
   | MigrationPilot Team | $149/month, recurring | `migrationpilot_team_monthly` | `tier` = `team` |
   | MigrationPilot Enterprise | $499/month, recurring | `migrationpilot_enterprise_monthly` | `tier` = `enterprise` |

   - Add the `tier` metadata on each **Price** (not the Product)
   - Copy the **Price IDs** (format: `price_xxxxx`) — needed for Vercel env vars

3. **Get your Stripe Secret Key**: Dashboard → Developers → API Keys
   - Test mode: starts with `sk_test_`
   - Live mode: starts with `sk_live_`

4. **Create a Webhook Endpoint**: Dashboard → Developers → Webhooks
   - URL: `https://migrationpilot.dev/api/stripe-webhook`
   - Events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
   - Copy the **Webhook Signing Secret** (starts with `whsec_`)

5. **Enable Customer Portal**: Dashboard → Settings → Billing → Customer Portal
   - Allow customers to cancel subscriptions
   - Allow customers to update payment methods
   - Set return URL to `https://migrationpilot.dev/billing`

---

## 3. Domain Setup (Required for site to be live)

1. **Register `migrationpilot.dev`** via Namecheap, Cloudflare, or Google Domains (~$12/year)
2. **Point DNS to Vercel**: Add CNAME record pointing to `cname.vercel-dns.com`
   - Vercel will guide you when you add the custom domain in the dashboard

---

## 4. Resend Setup (Required for license key emails)

1. **Create a Resend account** at https://resend.com (free tier: 100 emails/day)
2. **Verify your domain** (`migrationpilot.dev`):
   - Resend Dashboard → Domains → Add Domain
   - Add the DNS records Resend provides (SPF, DKIM, DMARC — usually 3 TXT records)
   - Wait for verification (5-30 minutes)
3. **Get your API Key**: Resend Dashboard → API Keys (starts with `re_`)

Without domain verification, emails from `noreply@migrationpilot.dev` will be rejected by email providers.

---

## 5. Vercel Deployment

1. **Link the project**:
   ```bash
   cd migrationpilot
   vercel link
   ```
   - Select "migrationpilot" or create new project
   - Root directory: `./` (not `site/`)

2. **Add ALL environment variables** in Vercel Dashboard → Project → Settings → Environment Variables:

   | Variable | Value | Source |
   |----------|-------|--------|
   | `STRIPE_SECRET_KEY` | `sk_live_xxxxx` | Stripe → API Keys |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_xxxxx` | Stripe → Webhooks |
   | `STRIPE_PRICE_PRO` | `price_xxxxx` | Stripe → Products → Pro price |
   | `STRIPE_PRICE_TEAM` | `price_xxxxx` | Stripe → Products → Team price |
   | `STRIPE_PRICE_ENTERPRISE` | `price_xxxxx` | Stripe → Products → Enterprise price |
   | `MIGRATIONPILOT_SIGNING_SECRET` | (your 64-char hex) | Generated in step 1 |
   | `RESEND_API_KEY` | `re_xxxxx` | Resend → API Keys |
   | `EMAIL_FROM` | `MigrationPilot <noreply@migrationpilot.dev>` | Your verified domain |
   | `SITE_URL` | `https://migrationpilot.dev` | Your domain |

3. **Add custom domain**: Vercel Dashboard → Project → Settings → Domains → Add `migrationpilot.dev`

---

## 6. npm Publish Setup (Required for CLI to be installable)

1. **Create an npm account** at https://www.npmjs.com
2. **Generate an npm token**: `npm token create` (or use npm dashboard)
3. **Add GitHub repo secrets** (Repo → Settings → Secrets → New):
   - `NPM_TOKEN` — your npm publish token
   - `MIGRATIONPILOT_SIGNING_SECRET` — same value as Vercel env var
4. The publish workflow (`.github/workflows/publish.yml`) already injects the signing secret during build and publishes with provenance

---

## 7. GitHub Action Marketplace

1. **Make the repo public** when ready to launch
2. **Create a release** with tag `v1.1.0` — this triggers the publish workflow
3. The action is automatically listed on GitHub Marketplace via `action.yml`

---

## 8. Email Address Setup

Set up `hello@migrationpilot.dev` email forwarding (used for Enterprise contact CTA):
- **Cloudflare**: Email Routing → catch-all or specific rule → forward to your personal email
- **Namecheap**: Email forwarding in domain settings
- Or use Google Workspace / Zoho free plan

---

## 9. GitHub Sponsors (Optional)

1. Enable GitHub Sponsors at https://github.com/sponsors
2. `.github/FUNDING.yml` already points to `mickelsamuel`

---

## Pre-Launch Testing Checklist

Test the full flow with Stripe **test mode** before going live:

- [ ] Set all Vercel env vars to Stripe **test** keys (`sk_test_`, `whsec_test_`)
- [ ] Deploy to Vercel preview URL
- [ ] Click "Get Pro" → verify Stripe Checkout opens
- [ ] Complete payment with test card `4242 4242 4242 4242`
- [ ] Verify redirect to `/checkout/success`
- [ ] Verify license key email arrives (check Resend dashboard)
- [ ] Copy the license key from email
- [ ] Run: `MIGRATIONPILOT_LICENSE_KEY=<key> npx migrationpilot analyze migration.sql`
- [ ] Verify Pro rules (MP013, MP014, MP019) are active
- [ ] Go to `/billing` → verify Stripe Customer Portal opens
- [ ] Cancel subscription in portal → verify webhook fires
- [ ] Test upgrade flow: change plan → verify new key generated

---

## Cost Summary

| Item | Cost | When |
|------|------|------|
| `migrationpilot.dev` domain | ~$12/year | Before launch |
| Vercel Hobby plan | Free | Now |
| Stripe | 2.9% + $0.30 per transaction | On revenue |
| Resend | Free (100 emails/day) | Now |
| npm | Free | Now |
| **Total pre-revenue cost** | **~$12** | |

---

## Launch Sequence (When Ready)

1. Complete all setup above
2. Run through the pre-launch testing checklist
3. Switch Stripe to live keys
4. Make GitHub repo public
5. Create release `v1.1.0` (triggers npm publish + GitHub Action Marketplace)
6. Deploy to production Vercel
7. Show HN post
8. Blog post: "Why Your PostgreSQL Migrations Are More Dangerous Than You Think"
