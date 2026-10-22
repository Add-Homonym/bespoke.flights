import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { listEmptyLegs } from '@/lib/empty-legs/service';

/** Public: upcoming empty legs. `?from=HNL&to=OGG` filter by airport code (IATA or ICAO). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const legs = await listEmptyLegs(getDb(), { from: url.searchParams.get('from'), to: url.searchParams.get('to') });
  return NextResponse.json(legs);
}
