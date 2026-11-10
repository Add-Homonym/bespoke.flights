import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, row, type Fixture } from '@/lib/payments/__tests__/fixtures';
import { setDb } from '@/lib/db';
import { MAX_PHOTOS } from '@/lib/fleet';
import type { SessionPayload } from '@/lib/types';

/** Fleet management: edit, remove, photos, FAA registry lookup. */

const who = vi.hoisted(() => ({ session: null as SessionPayload | null }));
vi.mock('@/lib/auth', () => ({ getSession: async () => who.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

let f: Fixture;
let list: typeof import('./route');
let one: typeof import('./[aircraftId]/route');
let photos: typeof import('./[aircraftId]/photos/route');
let photo: typeof import('./[aircraftId]/photos/[photoId]/route');
let serve: typeof import('../aircraft-photos/[photoId]/route');
let faaPreview: typeof import('./faa/route');
let faaStore: typeof import('./[aircraftId]/faa/route');

const json = (body: unknown, method = 'PATCH') =>
  new Request('http://localhost/x', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const ctx = (aircraftId: number) => ({ params: Promise.resolve({ aircraftId: String(aircraftId) }) });
const photoCtx = (aircraftId: number, photoId: number) => ({ params: Promise.resolve({ aircraftId: String(aircraftId), photoId: String(photoId) }) });

/** A tiny but valid-looking JPEG (SOI marker + filler + EOI). */
const jpeg = (fill = 7, size = 64) => {
  const b = new Uint8Array(size).fill(fill);
  b.set([0xff, 0xd8, 0xff, 0xe0], 0);
  b.set([0xff, 0xd9], size - 2);
  return b;
};
const upload = (bytes: Uint8Array, extra: Record<string, string | Blob> = {}) => {
  const form = new FormData();
  form.set('photo', new Blob([bytes as BlobPart], { type: 'image/jpeg' }), 'p.jpg');
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  return new Request('http://localhost/x', { method: 'POST', body: form });
};

const asOperator = async (operatorId: number) => {
  who.session = { userId: (await row<{ user_id: number }>(f.db, 'SELECT user_id FROM operators WHERE id = ?', operatorId)).user_id, role: 'operator' };
};

let aircraftA: number;

beforeAll(async () => {
  f = await createFixture();
  setDb(f.db);
  list = await import('./route');
  one = await import('./[aircraftId]/route');
  photos = await import('./[aircraftId]/photos/route');
  photo = await import('./[aircraftId]/photos/[photoId]/route');
  serve = await import('../aircraft-photos/[photoId]/route');
  faaPreview = await import('./faa/route');
  faaStore = await import('./[aircraftId]/faa/route');
});

beforeEach(async () => {
  await f.db.run('DELETE FROM rate_limits');
  await f.db.run('UPDATE quotes SET aircraft_id = NULL');
  await f.db.run('DELETE FROM aircraft');
  await asOperator(f.operatorA);
  const res = await list.POST(json({ tailNumber: 'n628ts', type: 'G650', capacity: 12 }, 'POST'));
  expect(res.status).toBe(201);
  aircraftA = (await res.json()).id;
});

afterAll(() => { setDb(null); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('aircraft edit and removal', () => {
  it('normalizes the tail number on create and lists photos and record', async () => {
    const fleet = await (await list.GET()).json();
    expect(fleet).toHaveLength(1);
    expect(fleet[0]).toMatchObject({ tail_number: 'N628TS', photos: [], faa_record: null });
  });

  it('updates the fields sent and leaves the rest', async () => {
    const res = await one.PATCH(json({ capacity: 14, rangeNm: 7500, serialNumber: '6177' }), ctx(aircraftA));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ capacity: 14, range_nm: 7500, serial_number: '6177', type: 'G650' });
  });

  it('clears an optional field sent as empty or null', async () => {
    await one.PATCH(json({ year: 2015, serialNumber: '6177' }), ctx(aircraftA));
    const res = await one.PATCH(json({ year: null, serialNumber: '' }), ctx(aircraftA));
    expect(await res.json()).toMatchObject({ year: null, serial_number: null });
  });

  it('rejects unknown fields and invalid values', async () => {
    expect((await one.PATCH(json({ operator_id: f.operatorB }), ctx(aircraftA))).status).toBe(400);
    expect((await one.PATCH(json({ capacity: 0 }), ctx(aircraftA))).status).toBe(400);
    expect((await one.PATCH(json({ type: null }), ctx(aircraftA))).status).toBe(400);
  });

  it('drops the FAA record when the tail number changes', async () => {
    await f.db.run(`UPDATE aircraft SET faa_record = '{"status":"assigned"}', faa_checked_at = now() WHERE id = ?`, [aircraftA]);
    const same = await (await one.PATCH(json({ tailNumber: 'N628TS' }), ctx(aircraftA))).json();
    expect(same.faa_record).toEqual({ status: 'assigned' });
    const moved = await (await one.PATCH(json({ tailNumber: 'N1KE' }), ctx(aircraftA))).json();
    expect(moved).toMatchObject({ tail_number: 'N1KE', faa_record: null, faa_checked_at: null });
  });

  it('hides the aircraft from another operator', async () => {
    await asOperator(f.operatorB);
    expect((await one.GET(new Request('http://localhost/x'), ctx(aircraftA))).status).toBe(404);
    expect((await one.PATCH(json({ capacity: 2 }), ctx(aircraftA))).status).toBe(404);
    expect((await one.DELETE(new Request('http://localhost/x'), ctx(aircraftA))).status).toBe(404);
  });

  it('rejects customers and anonymous callers', async () => {
    who.session = { userId: f.customerId, role: 'customer' };
    expect((await one.PATCH(json({ capacity: 2 }), ctx(aircraftA))).status).toBe(401);
    who.session = null;
    expect((await list.GET()).status).toBe(401);
  });

  it('refuses to remove an aircraft that is on a quote', async () => {
    await f.db.run('UPDATE quotes SET aircraft_id = ? WHERE id = ?', [aircraftA, f.quoteA]);
    const res = await one.DELETE(new Request('http://localhost/x'), ctx(aircraftA));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/1 quote/);
  });

  it('removes an aircraft and its photos', async () => {
    await photos.POST(upload(jpeg()), ctx(aircraftA));
    expect((await one.DELETE(new Request('http://localhost/x'), ctx(aircraftA))).status).toBe(204);
    expect((await row<{ n: number }>(f.db, 'SELECT COUNT(*)::int AS n FROM aircraft_photos')).n).toBe(0);
  });
});

describe('aircraft photos', () => {
  it('stores the bytes and serves them back unchanged, thumb included', async () => {
    const full = jpeg(1, 2048);
    const thumb = jpeg(2, 256);
    const res = await photos.POST(upload(full, { thumb: new Blob([thumb as BlobPart]), width: '1600', height: '1067', caption: ' Cabin ' }), ctx(aircraftA));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.photos[0]).toMatchObject({ position: 0, width: 1600, height: 1067, caption: 'Cabin', content_type: 'image/jpeg' });

    who.session = null; // public route
    const got = await serve.GET(new Request('http://localhost/x'), { params: Promise.resolve({ photoId: String(body.id) }) });
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('image/jpeg');
    expect(got.headers.get('cache-control')).toContain('immutable');
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(full);

    const small = await serve.GET(new Request('http://localhost/x?size=thumb'), { params: Promise.resolve({ photoId: String(body.id) }) });
    expect(new Uint8Array(await small.arrayBuffer())).toEqual(thumb);
  });

  it('serves the full image when there is no thumb', async () => {
    const full = jpeg(3);
    const { id } = await (await photos.POST(upload(full), ctx(aircraftA))).json();
    const small = await serve.GET(new Request('http://localhost/x?size=thumb'), { params: Promise.resolve({ photoId: String(id) }) });
    expect(new Uint8Array(await small.arrayBuffer())).toEqual(full);
  });

  it('rejects files that are not images, whatever their declared type', async () => {
    const res = await photos.POST(upload(new TextEncoder().encode('<svg onload=alert(1)>')), ctx(aircraftA));
    expect(res.status).toBe(415);
  });

  it('rejects an upload with no photo', async () => {
    expect((await photos.POST(new Request('http://localhost/x', { method: 'POST', body: new FormData() }), ctx(aircraftA))).status).toBe(400);
  });

  it(`caps photos at ${MAX_PHOTOS}`, async () => {
    for (let i = 0; i < MAX_PHOTOS; i++) expect((await photos.POST(upload(jpeg(i)), ctx(aircraftA))).status).toBe(201);
    expect((await photos.POST(upload(jpeg()), ctx(aircraftA))).status).toBe(409);
  });

  it('sets the cover, removes a photo and keeps positions contiguous', async () => {
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) ids.push((await (await photos.POST(upload(jpeg(i)), ctx(aircraftA))).json()).id);

    const covered = await (await photo.PATCH(json({ cover: true }), photoCtx(aircraftA, ids[2]!))).json();
    expect(covered.photos.map((p: { id: number }) => p.id)).toEqual([ids[2], ids[0], ids[1]]);

    const removed = await (await photo.DELETE(new Request('http://localhost/x'), photoCtx(aircraftA, ids[0]!))).json();
    expect(removed.photos.map((p: { id: number; position: number }) => [p.id, p.position])).toEqual([[ids[2], 0], [ids[1], 1]]);
  });

  it('does not let another operator upload or change photos', async () => {
    const { id } = await (await photos.POST(upload(jpeg()), ctx(aircraftA))).json();
    await asOperator(f.operatorB);
    expect((await photos.POST(upload(jpeg()), ctx(aircraftA))).status).toBe(404);
    expect((await photo.DELETE(new Request('http://localhost/x'), photoCtx(aircraftA, id))).status).toBe(404);
  });

  it('does not accept a photo id from a different aircraft', async () => {
    const { id } = await (await photos.POST(upload(jpeg()), ctx(aircraftA))).json();
    const other = (await (await list.POST(json({ tailNumber: 'N2', type: 'King Air', capacity: 8 }, 'POST'))).json()).id;
    expect((await photo.DELETE(new Request('http://localhost/x'), photoCtx(other, id))).status).toBe(404);
  });
});

describe('FAA registry lookup', () => {
  const page = `<main><table><caption class="devkit-table-title">Aircraft Description</caption>
    <tr><td data-label="">Serial Number</td> <td data-label="Serial Number">6177 </td></tr>
    <tr><td data-label="">Manufacturer Name</td> <td data-label="Manufacturer Name">GULFSTREAM AEROSPACE CORP </td></tr>
    <tr><td data-label="">Model</td> <td data-label="Model">GVI (G650ER) </td></tr>
    <tr><td data-label="">MFR Year</td> <td data-label="MFR Year">2015 </td></tr>
    <tr><td data-label="">Expiration Date</td> <td data-label="Expiration Date">03/31/2029 </td></tr></table></main>`;
  let calls: string[];

  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', async (url: string) => { calls.push(url); return new Response(page, { status: 200 }); });
  });

  it('previews a registration with a suggested type', async () => {
    const res = await faaPreview.GET(new Request('http://localhost/api/fleet/faa?n=628ts'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ suggestedType: 'Gulfstream GVI (G650ER)', record: { status: 'assigned', year: 2015, registrationExpires: '2029-03-31' } });
    expect(calls[0]).toContain('nNumberTxt=N628TS');
  });

  it('rejects a non-US registration without calling the FAA', async () => {
    expect((await faaPreview.GET(new Request('http://localhost/api/fleet/faa?n=C-GABC'))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('stores the record and fills blank fields only', async () => {
    await one.PATCH(json({ year: 2016 }), ctx(aircraftA));
    const res = await faaStore.POST(new Request('http://localhost/x', { method: 'POST' }), ctx(aircraftA));
    expect(res.status).toBe(200);
    const a = await res.json();
    expect(a).toMatchObject({ serial_number: '6177', manufacturer: 'GULFSTREAM AEROSPACE CORP', model: 'GVI (G650ER)', year: 2016 });
    expect(a.faa_record.status).toBe('assigned');
    expect(a.faa_checked_at).toBeTruthy();
  });

  it('reports the registry being down as 502', async () => {
    vi.stubGlobal('fetch', async () => new Response('Access Denied', { status: 403 }));
    expect((await faaStore.POST(new Request('http://localhost/x', { method: 'POST' }), ctx(aircraftA))).status).toBe(502);
  });

  it('rate-limits lookups per user', async () => {
    for (let i = 0; i < 30; i++) await faaPreview.GET(new Request('http://localhost/api/fleet/faa?n=N628TS'));
    expect((await faaPreview.GET(new Request('http://localhost/api/fleet/faa?n=N628TS'))).status).toBe(429);
  });
});
