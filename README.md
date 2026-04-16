# bespoke.flights

Private aviation charter marketplace. Travelers submit multi-leg flight requests, certified charter operators compete with quotes, and bookings happen directly — no broker markup.

**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · better-sqlite3 · Resend (email) · Vercel Cron

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
5. **Accept a quote.** Accepting one quote auto-rejects all others and marks the request as booked.

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

## Admin Workflow

1. **Dashboard** at `/admin/dashboard` — system-wide stats (users, operators, requests, quotes, bookings) plus the operator discovery pipeline summary.
2. **Approve operators** at `/admin/operators` — review pending registrations, approve or suspend.
3. **Manage users** at `/admin/users`.
4. **View all requests** at `/admin/requests`.
5. **Operator discovery** at `/admin/discoveries` — manage FAA-discovered operators (details below).

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

## Email System

All email is sent through Resend's API via `src/lib/email/resend.ts`. Two email templates exist:

| Template | Trigger | Content |
|---|---|---|
| **Operator Invite** | Discovery pipeline or manual trigger | Introduces Bespoke Flights, explains the marketplace model, links to `/register?role=operator` |
| **RFQ Notification** | Customer submits a booking request | Full itinerary, passenger count, match score, link to `/operator/inbound` |

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
│       └── quotes/             # Quote acceptance/rejection
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
    │   ├── index.ts            # SQLite connection (better-sqlite3, WAL mode)
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
    └── outreach/
        └── engine.ts           # Matching algorithm, RFQ generation, Resend delivery
```

---

## Database Schema

Seven tables in SQLite (better-sqlite3, WAL mode):

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

---

## Getting Started

```bash
git clone https://github.com/Add-Homonym/bespoke.flights.git
cd bespoke.flights
npm install
cp .env.example .env.local    # fill in values
npm run seed                   # creates SQLite DB with test data
npm run dev                    # http://localhost:3000
```

### Test Accounts

All use password `password123`:

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

---

## Deployment (Vercel)

```bash
vercel deploy
```

Set environment variables in the Vercel dashboard. The cron schedule in `vercel.json` runs the discovery pipeline every Monday at 18:00 UTC (8:00 AM HST). Vercel Cron requires a Pro plan.

To test the cron endpoint locally:

```bash
curl -X POST http://localhost:3000/api/cron/weekly-discovery \
  -H "Content-Type: application/json" \
  -d '{"states": ["HI"], "emailsPerRun": 5}'
```

---

## Pending / Future Work

- **Twilio SMS integration** — contact method `text` and `both` are supported in the data model and UI but SMS delivery is stubbed.
- **Payment processing** — booking confirmation currently just updates status; no payment flow exists.
- **Resend webhooks** — track email bounces and mark discovered operators as `bounced` automatically.
- **Secondary email discovery** — the FAA registry doesn't publish emails. A future enrichment step (website scraping or data API) could automate email collection for `no_email` operators.
- **AI phone outreach** — the contact method enum can be extended with `phone` for Bland.ai / Vapi voice agent integration.
- **Commission tracking** — the platform earns commission on confirmed bookings, but no invoicing or payment split exists yet.
