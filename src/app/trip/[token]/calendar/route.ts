import { getDb } from '@/lib/db';
import { appBaseUrl } from '@/lib/payments/config';
import { loadTripSheet, tripSheetIcs, shareUrl } from '@/lib/sharing/trip-share';

/** Calendar file (one event per leg) for a shared trip sheet. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sheet = await loadTripSheet(getDb(), token);
  if (!sheet) return new Response('Not found', { status: 404 });

  return new Response(tripSheetIcs(sheet, shareUrl(appBaseUrl(req), token)), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="booking-${sheet.requestId}.ics"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
