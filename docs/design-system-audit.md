# Design system audit (current)

Generated from `src/` after the royal-purple restyle (PR #8) and the review fixes. Regenerate with `the generator snippet in the commit that last touched this file` or by re-running the snippet in git history for this file.

## Hard-coded hex colours outside globals.css

None.

(`src/lib/email/templates.ts` keeps literal hex for email clients; it is out of scope.)

## Colour tokens in use (Tailwind classes)

- `text-ink-muted` (213)
- `text-ink` (140)
- `border-hairline` (59)
- `bg-surface-raised` (36)
- `text-royal` (31)
- `text-ink-subtle` (25)
- `text-danger` (19)
- `bg-surface-sunken` (18)
- `border-border-control` (11)
- `text-warning` (9)
- `border-danger` (7)
- `border-brass` (6)
- `bg-danger-tint` (6)
- `text-confirmed` (5)
- `border-warning` (5)
- `bg-warning-tint` (5)
- `text-on-night-muted` (5)
- `bg-royal` (4)
- `text-on-royal` (4)
- `bg-brass` (3)
- `text-on-night` (3)
- `bg-confirmed-tint` (2)
- `bg-night` (2)
- `ring-brass` (1)
- `border-confirmed` (1)
- `text-on-brass` (1)
- `bg-confirmed` (1)
- `bg-warning` (1)
- `bg-ink-subtle` (1)
- `bg-surface` (1)

## Raw Tailwind text sizes (not from the type scale)

- `text-sm` (95): src/components/board/company-board.tsx:106, src/components/board/company-board.tsx:109, src/components/board/company-board.tsx:126, src/components/admin/refund-button.tsx:52, src/components/admin/refund-button.tsx:59, src/components/ui/table.tsx:4 …
- `text-xs` (71): src/components/board/company-board.tsx:87, src/components/board/company-board.tsx:92, src/components/board/company-board.tsx:118, src/components/board/company-board.tsx:140, src/components/admin/refund-button.tsx:65, src/components/ui/table.tsx:14 …
- `text-3xl` (22): src/app/board/[token]/page.tsx:25, src/app/trip/[token]/page.tsx:27, src/app/(operator)/operator/board/page.tsx:9, src/app/(operator)/operator/team/page.tsx:8, src/app/(operator)/operator/quotes/page.tsx:40, src/app/(operator)/operator/quotes/page.tsx:62 …
- `text-lg` (5): src/app/(operator)/operator/inbound/page.tsx:180, src/app/(operator)/operator/inbound/page.tsx:197, src/app/(operator)/operator/fleet/page.tsx:103, src/app/(operator)/operator/dashboard/page.tsx:76, src/app/(admin)/admin/operators/page.tsx:40
- `text-xl` (4): src/components/board/company-board.tsx:105, src/components/operator/team-manager.tsx:146, src/app/(admin)/admin/discoveries/page.tsx:161, src/app/(admin)/admin/dashboard/page.tsx:50
- `text-2xl` (3): src/app/(operator)/operator/requests/[requestId]/page.tsx:85, src/app/(operator)/operator/dashboard/page.tsx:79, src/app/(admin)/admin/payments/page.tsx:72
- `text-base` (1): src/app/(operator)/operator/requests/[requestId]/page.tsx:41

## Type-scale utilities in use

- `text-label` (35)
- `text-body` (34)
- `text-title` (12)
- `text-display` (11)
- `text-heading` (7)
- `text-overline` (6)
- `text-figure` (3)
- `text-display-xl` (3)

## Fonts

- Display: Helvetica Neue / Helvetica / Arial, weight 700 (`--font-display`, headings and the type-scale display/title utilities).
- Sans: Hanken Grotesk via `next/font/google` (`--font-hanken-grotesk`), 400/500/600.

## Radii, shadows, spacing

- Radii: sm 8px, md 14px, lg 22px, pill. Shadows: raised, float. Spacing: Tailwind 4px scale.

## Gold (`brass`) per screen region

- Logo lockup (emblem + rule + "Flights") counts as one gold element.
- Quote list: the "Best value" badge is the only gold fill; the selected quote uses the gold outline; quiet buttons are royal, not gold.
