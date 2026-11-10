# Walkthrough results (2026-10)

91/91 checks passed.

| Result | Item | Note |
| --- | --- | --- |
| pass | E4 "City or code" placeholder fits at 390px | [{"id":"ticket-1-from","text":88.3681640625,"box":140},{"id":"ticket-1-to","text":88.3681640625,"box":140}] |
| pass | E2 Enter selects the top match and moves to the next field | from=HNL focus=ticket-1-to |
| pass | E2 destination resolves to OGG |  |
| pass | E2 resolved field is replaced, not appended to | LAX |
| pass | E3 explicit Request quotes button |  |
| pass | E1 saved draft is in the server HTML, fields locked until hydrated |  |
| pass | E1 typing after restore never merges with the saved draft | restored=HNL typed=O |
| pass | A2 register: message under the phone field in plain language | Test mode: all payments and payouts are simulated. No money moves. Demo logins: admin@bespoke.flights, john@example.com, ops@eliteair.com (password password123). BESPOKE FLIGHTS Create your account  J |
| pass | A2 register: summary line |  |
| pass | G2 operator sign-up link in header, footer and /login | login 1, header+footer 2 |
| pass | F1 request page reads HNL → OGG, not ICAO |  |
| pass | F4 aircraft says To be assigned only when no quote names one |  |
| pass | request page: no raw error text |  |
| pass | F2 no score, no "via", correct plural |  |
| pass | G1 checklist with done/missing and what approval waits on |  |
| pass | G1 routing profile explained |  |
| pass | G3 pending operator sees route/date/pax, not notes |  |
| pass | G3 API matches the UI |  |
| pass | D1 valid-until defaults to 72 hours out | 2026-10-25 |
| pass | D1 min is today and max is the departure date | 2026-10-22..2026-11-11 |
| pass | A2/D1 past valid-until shows a field error under the field |  |
| pass | D1 valid-until after departure is rejected |  |
| pass | D2 price below the minimum is rejected in plain language |  |
| pass | D2 fractions of a cent are rejected |  |
| pass | A4 on-screen confirmation after submit |  |
| pass | A4 quote card shows aircraft (type · tail) and valid-until |  |
| pass | D2/A2 revise price error shown in the UI |  |
| pass | D1/A2 revise valid-until error shown in the UI |  |
| pass | revise succeeds inside the window |  |
| pass | A3 rejected auto-save reverts the field and shows the error beside it | ops@pacificwings.com → ops@pacificwings.com |
| pass | A3 Saved shows next to the field that saved |  |
| pass | H3 12.5% refund percentage rejected |  |
| pass | H2 safety rating select is labelled |  |
| pass | C1 seats max comes from the aircraft | max=6 |
| pass | C1 seats above capacity rejected in the form |  |
| pass | C1 past date rejected |  |
| pass | C1 valid listing accepted |  |
| pass | C2 operator can edit seats, date, notes and price on an unbooked listing |  |
| pass | F6 filter placeholders are From / To |  |
| pass | C3 no "Confirmed:" banner before payment |  |
| pass | C3 status reads Awaiting payment |  |
| pass | C3 aircraft filled from the listing |  |
| pass | C4 no "Empty leg #N" special request; traveler notes carried |  |
| pass | C4 operator view carries the traveler notes |  |
| pass | A4 traveler quote shows aircraft and valid-until |  |
| pass | F3 cancellation policy on the quote card |  |
| pass | F4 aircraft shows the quoted aircraft, not To be assigned |  |
| pass | F3 cancellation policy shown before payment |  |
| pass | A1 Pay is disabled and reads "Paying…" while the call runs |  |
| pass | A1 success state shows without a reload |  |
| pass | A1 repeat call on a succeeded payment returns 200 | 200 |
| pass | booked request: no raw error text |  |
| pass | H2 change-form From input shows a focus outline |  |
| pass | F1 change form reads IATA codes |  |
| pass | A2 change request errors are field-level and plain |  |
| pass | operator accepts the change |  |
| pass | F5 receipt button says Print receipt |  |
| pass | F1 receipt shows IATA codes |  |
| pass | receipt: no raw error text |  |
| pass | B1 banner: refund amount, destination, tier and time |  |
| pass | B1 banner persists after reload |  |
| pass | B2 quote shows Cancelled, never Accepted |  |
| pass | B3 pending change request closed with the reason |  |
| pass | B4 message thread is read-only |  |
| pass | cancelled request: no raw error text |  |
| pass | B5 operator cancellation summary: refund, tier, payout adjustment |  |
| pass | B3 operator sees the closed change request |  |
| pass | B4 operator thread read-only |  |
| pass | B2 My quotes shows one status per cancelled quote | HNL → OGG /  / Dassault Falcon 50EX · $23,500 /  / 10/22/2026 /  / CANCELLED · REFUNDED |
| pass | B6 dashboard accepted/total exclude the cancelled booking |  |
| pass | H1 touch targets ≥44px on operator dashboard |  |
| pass | H1 touch targets ≥44px on operator settings |  |
| pass | H1 touch targets ≥44px on operator autopilot |  |
| pass | H1 touch targets ≥44px on operator requests |  |
| pass | H1 touch targets ≥44px on operator empty legs |  |
| pass | axe book (light): zero violations |  |
| pass | axe request-page (light): zero violations |  |
| pass | axe checkout (light): zero violations |  |
| pass | axe receipt (light): zero violations |  |
| pass | axe operator-dashboard (light): zero violations |  |
| pass | axe quote-form (light): zero violations |  |
| pass | axe operator-empty-legs (light): zero violations |  |
| pass | axe operator-settings (light): zero violations |  |
| pass | axe book (dark): zero violations |  |
| pass | axe request-page (dark): zero violations |  |
| pass | axe checkout (dark): zero violations |  |
| pass | axe receipt (dark): zero violations |  |
| pass | axe operator-dashboard (dark): zero violations |  |
| pass | axe quote-form (dark): zero violations |  |
| pass | axe operator-empty-legs (dark): zero violations |  |
| pass | axe operator-settings (dark): zero violations |  |
