# bespoke.flights

Private aviation charter marketplace. Travelers submit multi-leg flight requests, certified charter operators compete with quotes, and bookings happen directly — no broker markup.

**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Postgres (Neon via Vercel) · Stripe (Checkout + Connect) · Resend (email) · Vercel Cron

---

## How It Works

```
Traveler submits request → Matching engine scores operators → RFQs dispatched via email/SMS
                                                                   ↓
                                                       Operators quote from their dashboard
                                                                   ↓
                                                       Traveler compares and accepts a quote
                                                                   ↓
                                                              Booking confirmed
```

There are three user roles — **customer**, **operator**, and **admin** — each with their own authenticated views and workflows.

---

## Customer Workflow

1. **Register** at `/register` (role: customer).
2. **Build an itinerary** at `/book` — origin, destination, date, and time for each leg. Supports multi-leg trips (A → B → C → A).
3. **Submit the request.** The matching engine immediately runs, scoring all approved operators on market coverage, fleet fit, safety rating, and past performance. The top 10 matches receive the RFQ automatically.
4. **View request status** at `/requests/[id]`. The Operator Outreach section shows which operators were contacted, their match scores, and whether they've responded. Quotes appear below, sorted by price.
5. **Accept & pay.** Choosing a quote opens Stripe Checkout (card or US bank account). When payment succeeds, that quote is accepted, all others are rejected, and the request is marked booked. See [Payments](#payments).

## Operator Workflow

1. **Register** at `/register?role=operator`. Account starts in `pending` status.
2. **Configure profile** at `/operator/settings` once approved by an admin:
   - Preferred contact method (email, text, or both)
   - Charter sales email and SMS phone number
   - Safety rating (ARGUS Platinum through Part 135 Certified)
   - Market coverage (10 regions: Hawaii inter-island, mainland→Hawaii, US West/East/Southeast/Central/Southwest, Caribbean, transatlantic, Pacific)
   - Fleet categories (VLJ through ultra-long range)
   - Hawaii-capable and transoceanic flags
   - FAA certificate number
3. **Receive inbound RFQs** at `/operator/inbound`. These are charter requests automatically matched to the operator's profile by the matching engine. Each card shows the route, pax count, dates, match score, and time since receipt.
4. **Submit a quote** inline — price, aircraft (from fleet inventory), valid-until date, and an optional message. One click creates the quote and marks the outreach log as responded.
5. **Browse all demand** at `/operator/requests` to see every open request on the platform, not just auto-matched ones.
6. **Manage fleet** at `/operator/fleet` — add aircraft with tail number, type, capacity, range, and year.
7. **Set up payouts** at `/operator/settings` → Payouts. This opens Stripe Connect Express onboarding. Customers cannot pay for an operator's quotes until onboarding is complete.

## Admin Workflow

1. **Dashboard** at `/admin/dashboard` — system-wide stats (users, operators, requests, quotes, bookings) plus the operator discovery pipeline summary.
2. **Approve operators** at `/admin/operators` — review pending registrations, approve or suspend.
3. **Manage users** at `/admin/users`.
4. **View all requests** at `/admin/requests`.
5. **Operator discovery** at `/admin/discoveries` — manage FAA-discovered operators (details below).
6. **Payments** at `/admin/payments` — gross bookings, net platform fees, refunds, disputes; issue full or partial refunds.

---

## Automatic Outreach System

When a customer submits a booking request, the matching engine runs synchronously before the API response returns.

### Matching Algorithm

Each approved operator is scored on a 100-point scale:

| Factor | Weight | Logic |
|---|---|---|
| Market coverage | 40% | Operator's configured markets include the classified market for this route |
| Fleet type match | 20% | Operator's fleet categories can serve the passenger count and route distance |
| Safety rating | 25% | ARGUS Platinum / Wyvern Wingman = 25, Gold = 18, Part 135 = 10 |
| Past performance | 15% | 3 points per accepted quote, capped at 15 |

Penalties are applied for route/capability mismatches:
- Route requires Hawaii but operator is not `hi_capable`: −30
- Route exceeds 3,000 nm but operator is not `transoceanic`: −20

The top 10 operators scoring above 20 are dispatched an RFQ.

### Market Classification

Routes are classified into one of 10 markets based on ICAO airport codes:

| Market | Examples |
|---|---|
| `hi_inter` | PHNL ↔ PHOG, PHKO, PHLI |
| `mainland_hi` | KLAX → PHNL, KJFK → PHNL |
| `west` | KLAX, KSFO, KSEA, KSAN, KPDX |
| `east` | KJFK, KTEB, KBOS, KPBI, KIAD |
| `se` | KATL, KMIA, KFLL, KTPA, KMCO |
| `central` | KORD, KDEN, KMSP, KDTW |
| `sw` | KDFW, KHOU, KLAS, KPHX |
| `carib` | TNCM, TJSJ, MYNN |
| `transatl` | EGLL, LFPB, EDDF |
| `pacific` | Pacific island codes |

### RFQ Delivery

Matched operators receive a branded HTML email via Resend containing the full itinerary, passenger count, notes, and a link to submit their quote. SMS delivery is stubbed for future Twilio integration. Without a `RESEND_API_KEY`, emails are logged to stdout.

---

## Operator Discovery Pipeline

A weekly automated pipeline finds new charter operators and invites them to join the platform.

### How It Works

1. **Vercel Cron** triggers `GET /api/cron/weekly-discovery` every Monday at 8:00 AM HST (18:00 UTC).
2. **FAA scraper** queries `av-info.faa.gov` for Part 135 on-demand air taxi certificate holders, processing 10 states per run and rotating through all US states across ~5 weeks.
3. **Deduplication** skips operators already in the `discovered_operators` table or registered on the platform.
4. **Storage** inserts new records. Since the FAA registry does not publish email addresses, most land with status `no_email`.
5. **Invite emails** are sent via Resend to any discovered operators that have an email address and status `new`. The branded email explains the marketplace, links to registration, and includes the operator's FAA certificate number.

### Discovery Statuses

| Status | Meaning |
|---|---|
| `new` | Has email, ready to send invite on next run |
| `no_email` | Found in FAA registry but no email — admin needs to add one |
| `emailed` | Invite sent via Resend |
| `registered` | Operator created an account on the platform |
| `opted_out` | Marked by admin as not interested |
| `bounced` | Email delivery failed |

### Admin Discovery UI

At `/admin/discoveries`, admins can:

- Filter by status, state, or search by company name / cert number
- Click **Add Email** on any `no_email` operator — status auto-upgrades to `new`, and the next cron run sends the invite
- Click **Opt out** to suppress future contact
- Click **Run Discovery Now** to manually trigger the pipeline
- View pipeline stats in the dashboard: total discovered, ready to email, need email, invited

---

## Payments

Stripe Checkout collects the customer's payment as a **destination charge** to the operator's Stripe Connect Express account. The operator is the settlement merchant (`on_behalf_of`); the platform keeps its commission as the `application_fee_amount`.

### Flow

```
Customer clicks "Accept & Pay" → POST /api/payments/checkout
   → payments row (pending) + Stripe Checkout Session (expires in 1 h)
   → customer pays on Stripe → redirected to /requests/[id]?checkout=success
Stripe → POST /api/webhooks/stripe (signature verified)
   → checkout.session.completed (paid) → payment succeeded, quote accepted,
     other quotes rejected, request booked, receipt + operator emails sent
```

- **Quotes are accepted only through payment.** `PATCH /api/quotes/[id]` can only decline.
- **One open checkout per request.** Starting a checkout for a different quote expires the previous session.
- **Double payment protection.** If two sessions are both paid, the second one is refunded automatically, including the transfer reversal.
- **Bank payments (ACH).** The payment shows as `processing` until `checkout.session.async_payment_succeeded` or `..._failed` arrives. The request is not booked until funds clear.
- **Expired quotes** (`valid_until` in the past) cannot be paid.
- **Webhooks are idempotent.** Event IDs are recorded in `payment_events`, and every handler can safely run more than once. If processing fails, the endpoint returns 500 so Stripe retries.

### Platform fee

`PLATFORM_FEE_BPS` sets the fee in basis points (default `500` = 5%). The `operators.platform_fee_bps` column overrides it for one operator. The fee is rounded to the nearest cent. Stripe's processing fees come out of the platform's share.

### Refunds and disputes

Admins refund from `/admin/payments`, in full or in part. Refunds use `reverse_transfer` and `refund_application_fee`, so the operator's payout and the platform fee are returned in proportion to the amount refunded. A full refund cancels the booking. Refunds made in the Stripe dashboard are synced through `charge.refunded`. `charge.dispute.*` events record a dispute's status on the payment.

### Payment statuses

| Status | Meaning |
|---|---|
| `pending` | Checkout session open |
| `processing` | Bank payment submitted, not yet cleared |
| `succeeded` | Paid; request booked |
| `partially_refunded` / `refunded` | Refunded; a full refund cancels the booking |
| `failed` | Checkout creation failed or the bank payment failed |
| `canceled` | Session expired or replaced by a newer checkout |

### Modes

| Mode | When | Behavior |
|---|---|---|
| `stub` (test mode) | `APP_TEST_MODE=true`, in any environment; a Stripe key is ignored | Payments are simulated (see [Test mode](#test-mode)) |
| `stripe` | `STRIPE_SECRET_KEY` set | Real Checkout and Connect |
| `stub` | No key, `NODE_ENV` ≠ production | Payments are simulated: the request page shows a "Simulate successful payment" button, and payout setup completes instantly |
| `disabled` | No key in production | Checkout returns 503, so no booking can be made without payment |

### Test mode

Set `APP_TEST_MODE=true` (for example on a Vercel deployment) to try the full flow with dummy transactions:

- **Payments are simulated.** "Accept & Pay" leads to a "Simulate successful payment" button; no card is charged. Operator payout setup completes instantly, without a Stripe account. Admin refunds work and move no money. Stripe webhooks are refused.
- **A banner on every page** says the site is in test mode and lists the demo logins.
- **Demo data loads automatically** the first time the app connects to an empty database: the test accounts below, three approved operators with fleets, two requests (one with two quotes ready to pay), and sample FAA discoveries. A database that already has users is never touched.

To go live: remove `APP_TEST_MODE`, set the Stripe variables, and delete the demo accounts (or start from a fresh database).

### Stripe setup

1. Enable **Connect** (Express accounts) on the Stripe account.
2. Add a webhook endpoint at `https://<host>/api/webhooks/stripe` for **your account** events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
3. Add a second endpoint at the same URL for **connected account** events: `account.updated`. Put its signing secret in `STRIPE_CONNECT_WEBHOOK_SECRET`.
4. Local testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

---

## Email System

All email is sent through Resend's API via `src/lib/email/resend.ts`. Four email templates exist:

| Template | Trigger | Content |
|---|---|---|
| **Operator Invite** | Discovery pipeline or manual trigger | Introduces Bespoke Flights, explains the marketplace model, links to `/register?role=operator` |
| **RFQ Notification** | Customer submits a booking request | Full itinerary, passenger count, match score, link to `/operator/inbound` |
| **Payment Receipt** | Payment succeeds | Sent to the customer: route, dates, operator, aircraft, total paid |
| **Booking Confirmed** | Payment succeeds | Sent to the operator: itinerary, quote amount, platform fee, payout |

A `sendBatch` helper handles rate limiting (1 email/second for Resend's free tier). Without `RESEND_API_KEY` set, all emails are logged to the console in stub mode.

---

## Project Structure

```
src/
├── app/
│   ├── (admin)/admin/          # Admin pages: dashboard, users, operators, requests, discoveries
│   ├── (auth)/                 # Login, register
│   ├── (customer)/             # Book, requests, account, dashboard
│   ├── (operator)/operator/    # Dashboard, inbound, requests, quotes, fleet, settings
│   └── api/
│       ├── admin/              # Admin endpoints: operators, users, discoveries
│       ├── auth/               # Login, logout, register
│       ├── booking-requests/   # CRUD + auto-outreach on POST
│       ├── cron/               # weekly-discovery (Vercel Cron)
│       ├── fleet/              # Operator aircraft management
│       ├── operator/           # Inbound RFQs, settings
│       ├── outreach/           # Outreach log queries
│       ├── payments/           # Checkout creation, stub-mode simulation
│       ├── quotes/             # Quote decline (acceptance is via payment)
│       └── webhooks/stripe/    # Stripe webhook receiver
├── components/
│   ├── admin/                  # Operator approval actions
│   ├── booking/                # Quote accept/decline buttons
│   ├── layout/                 # Header with role-based nav
│   ├── operator/               # Outreach status display
│   └── ui/                     # Badge, Button, Card, Input, Select, Table, AirportInput
└── lib/
    ├── auth.ts                 # JWT sessions via jose + cookies
    ├── airports.ts             # Airport code data
    ├── types.ts                # All TypeScript interfaces + market/fleet constants
    ├── validations.ts          # Zod schemas for all API inputs
    ├── db/
    │   ├── index.ts            # Postgres access: pg pool (Neon) or embedded PGlite
    │   ├── queries.ts          # Shared query helpers (batched legs, quote counts)
    │   ├── schema.ts           # Full DDL: users, operators, aircraft, booking_requests,
    │   │                       #   booking_legs, quotes, outreach_log, discovered_operators
    │   └── seed.ts             # Test data: 4 operators, 2 customers, 1 admin,
    │                           #   2 booking requests, sample quotes, 8 discovered operators
    ├── discovery/
    │   ├── faa-scraper.ts      # FAA Part 135 registry HTML scraper
    │   └── pipeline.ts         # Scrape → store → email orchestration
    ├── email/
    │   ├── resend.ts           # Resend API client with stub mode
    │   └── templates.ts        # Branded HTML email templates
    ├── outreach/
    │   └── engine.ts           # Matching algorithm, RFQ generation, Resend delivery
    └── payments/
        ├── config.ts           # Mode detection, fee calculation
        ├── stripe.ts           # Stripe client
        ├── service.ts          # Checkout, fulfillment, refunds, Connect, webhook handling
        └── __tests__/          # Vitest suite
```

---

## Database Schema

Eleven tables in Postgres:

| Table | Purpose |
|---|---|
| `users` | All accounts (customer, operator, admin). Passwords hashed with bcryptjs. |
| `operators` | Linked to a user. Company name, certificate, approval status, contact preferences, market/fleet/safety profile for matching. |
| `aircraft` | Operator fleet inventory. Tail number, type, capacity, range, year. |
| `booking_requests` | Customer trip requests. Status lifecycle: open → quoted → booked → completed (or cancelled). |
| `booking_legs` | Individual flight legs within a request. Origin, destination, date, time. |
| `quotes` | Operator price submissions. Linked to request + operator + optional aircraft. Status: pending → accepted/rejected/withdrawn. |
| `outreach_log` | Every RFQ dispatched to an operator. Method, match score, RFQ content, delivery status. Unique on (request_id, operator_id). |
| `discovered_operators` | FAA-scraped operators pending outreach. Certificate number (unique), contact info, discovery status. |
| `payments` | One row per checkout attempt. Amount, platform fee, operator payout, refunded total, Stripe session and PaymentIntent IDs, status. |
| `refunds` | Ledger of refunds issued from the app. |
| `payment_events` | Stripe webhook event IDs that have been processed, used for idempotency. |

The `operators` table also stores the Stripe Connect account ID, capability flags, and an optional fee override.

### Database access

`src/lib/db/index.ts` picks the database:

| `DATABASE_URL` | Database |
|---|---|
| Set | Postgres via `pg` (production: Neon's pooled connection string, injected by the Vercel integration) |
| Unset, development | Embedded [PGlite](https://pglite.dev) (Postgres compiled to WASM) in `data/pglite`. Nothing to install. |
| Unset, production | Startup error |

- **Schema** (`schema.ts`) is applied on the first query after each cold start. Every statement is `IF NOT EXISTS`, and an advisory lock stops concurrent cold starts from colliding. Schema changes must be additive and idempotent.
- **Queries** use `?` placeholders, which are rewritten to `$1, $2, …`. Do not put a literal `?` in SQL text.
- **Types:** `COUNT`/`SUM`/`BIGINT` values come back as JS numbers. Timestamps (`TIMESTAMPTZ`) come back as ISO 8601 strings. Money is stored in cents as `BIGINT`.
- **Payment fulfillment** locks the booking request row (`SELECT … FOR UPDATE`). Stripe webhooks for the same request on different serverless instances then run one at a time instead of deadlocking or double-booking.

---

## Getting Started

```bash
git clone https://github.com/Add-Homonym/bespoke.flights.git
cd bespoke.flights
npm install
cp .env.example .env.local    # fill in values
npm run seed                   # loads test data into the local PGlite database
npm run dev                    # http://localhost:3000
npm test                       # Vitest suite (in-process PGlite)
```

No database setup is needed locally. To develop against Neon instead, pull the project's env vars (`vercel env pull .env.local`). Prefer a Neon development branch over production. The seed script refuses to run when `DATABASE_URL` is set unless you pass `SEED_DATABASE=yes`, because it creates accounts with a known password.

To run the tests against a real Postgres server (tables are truncated):

```bash
TEST_DATABASE_URL=postgres://… npm run test:pg
```

### Test Accounts

Created by `npm run seed` locally, or automatically in [test mode](#test-mode). All use password `password123`:

| Email | Role | Notes |
|---|---|---|
| `admin@bespoke.flights` | Admin | Full platform access |
| `john@example.com` | Customer | Has a 3-leg east coast request with 2 quotes |
| `sarah@example.com` | Customer | Has a LAX↔HNL request, no quotes yet |
| `ops@eliteair.com` | Operator | Elite Air Charter — approved, full profile, G650 + Citation X |
| `ops@skybridge.com` | Operator | SkyBridge Aviation — approved, Global 7500 + Phenom 300E |
| `ops@pacificwings.com` | Operator | Pacific Wings — approved, Hawaii specialist |
| `ops@westsidejets.com` | Operator | Westside Jets — pending approval, no profile |

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | Yes | Random string for signing session tokens |
| `RESEND_API_KEY` | No | Resend API key. Without it, emails log to stdout. |
| `EMAIL_FROM` | No | Verified sender address (default: `hello@bespoke.flights`) |
| `CRON_SECRET` | Production | Secures the `/api/cron/weekly-discovery` endpoint |
| `STRIPE_SECRET_KEY` | Production | Stripe secret key. Without it, payments run in stub mode (development) or are disabled (production). |
| `STRIPE_WEBHOOK_SECRET` | Production | Signing secret for the platform webhook endpoint |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Production | Signing secret for the connected-accounts webhook endpoint |
| `PLATFORM_FEE_BPS` | No | Platform commission in basis points (default `500` = 5%) |
| `APP_URL` | No | Public base URL for Stripe redirect URLs and email links (defaults to the request origin) |
| `APP_TEST_MODE` | No | `true` simulates all payments, shows a test banner, and loads demo data into an empty database |
| `DATABASE_URL` | Production | Postgres connection string. Set automatically by the Vercel Neon integration (pooled). |
| `DATABASE_POOL_MAX` | No | Max connections per function instance (default 5) |
| `PGLITE_DIR` | No | Local PGlite data directory when `DATABASE_URL` is unset (default `data/pglite`; `memory` for in-memory) |

---

## Deployment (Vercel)

Vercel is the only host. `netlify.toml` tells Netlify to skip every build of this repository; Netlify's dashboard connection can also be removed.

### 1. Database: Neon through the Vercel Marketplace

1. In the Vercel dashboard, open the **bespoke.flights** project → **Storage** → **Create Database** → **Neon** (Serverless Postgres).
2. Choose a region close to the project's function region, then **Connect** it to the project for Production, Preview and Development.
3. The integration adds `DATABASE_URL` (pooled) and related `PG*`/`POSTGRES_*` variables. The app only reads `DATABASE_URL`.
4. Redeploy. Tables are created on the first request.

Optional: enable Neon's preview-branch option in the integration so each preview deployment gets its own database branch instead of sharing production data.

### 2. Other environment variables

Set `JWT_SECRET` (required: a long random string; without it, session tokens are signed with a public development key), `CRON_SECRET`, and the Stripe and Resend variables from the table above.

### 3. Deploy

```bash
vercel deploy
```

The cron schedule in `vercel.json` runs the discovery pipeline every Monday at 18:00 UTC (8:00 AM HST). Vercel Cron requires a Pro plan.

To test the cron endpoint locally:

```bash
curl -X POST http://localhost:3000/api/cron/weekly-discovery \
  -H "Content-Type: application/json" \
  -d '{"states": ["HI"], "emailsPerRun": 5}'
```

---

## Pending / Future Work

- **Twilio SMS integration** — contact method `text` and `both` are supported in the data model and UI but SMS delivery is stubbed.
- **Resend webhooks** — track email bounces and mark discovered operators as `bounced` automatically.
- **Secondary email discovery** — the FAA registry doesn't publish emails. A future enrichment step (website scraping or data API) could automate email collection for `no_email` operators.
- **AI phone outreach** — the contact method enum can be extended with `phone` for Bland.ai / Vapi voice agent integration.
- **Operator invoicing / 1099-K reporting** — Stripe Connect produces tax forms for Express accounts. No in-app invoice documents exist yet.
- **Deposits and balance payments** — the full quote amount is charged at booking. Split payments (deposit now, balance before departure) are not supported.
