import bcrypt from 'bcryptjs';
import type { Db } from './index';

/** Password for every demo account. */
export const DEMO_PASSWORD = 'password123';

export const DEMO_ACCOUNTS = [
  { email: 'admin@bespoke.flights', role: 'admin', note: 'Full platform access' },
  { email: 'john@example.com', role: 'customer', note: '3-leg east coast request with 2 quotes' },
  { email: 'sarah@example.com', role: 'customer', note: 'LAX ↔ HNL request, no quotes yet' },
  { email: 'ops@eliteair.com', role: 'operator', note: 'Elite Air Charter — approved' },
  { email: 'ops@skybridge.com', role: 'operator', note: 'SkyBridge Aviation — approved' },
  { email: 'ops@pacificwings.com', role: 'operator', note: 'Pacific Wings — approved, Hawaii' },
  { email: 'ops@westsidejets.com', role: 'operator', note: 'Westside Jets — pending approval' },
] as const;

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/**
 * Load demo accounts, operators, fleet, requests and quotes into an empty
 * database. Returns false (and changes nothing) if any user already exists.
 * Safe to call concurrently: serialized with an advisory lock.
 */
export async function seedDemoData(db: Db): Promise<boolean> {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  return db.transaction(async tx => {
    await tx.query('SELECT pg_advisory_xact_lock(727275)');
    const { count } = (await tx.one<{ count: number }>('SELECT COUNT(*) AS count FROM users'))!;
    if (count > 0) return false;

    const id = async (sql: string, params: unknown[]) =>
      (await tx.one<{ id: number }>(`${sql} RETURNING id`, params))!.id;

    const user = (email: string, phone: string, name: string, role: string) =>
      id('INSERT INTO users (email, phone, password_hash, name, role) VALUES (?, ?, ?, ?, ?)', [email, phone, hash, name, role]);

    const operator = (userId: number, values: unknown[]) =>
      id(`INSERT INTO operators (user_id, company_name, certificate, status, contact_method, contact_email, contact_phone,
            safety_rating, fleet_types, markets, range_max_nm, hi_capable, transoceanic)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [userId, ...values]);

    // ── Accounts ──
    await user('admin@bespoke.flights', '+1-555-000-0000', 'Admin User', 'admin');
    const john = await user('john@example.com', '+1-555-123-4567', 'John Traveler', 'customer');
    const sarah = await user('sarah@example.com', '+1-555-234-5678', 'Sarah Williams', 'customer');

    const elite = await operator(await user('ops@eliteair.com', '+1-555-345-6789', 'Mike Elite', 'operator'), [
      'Elite Air Charter', 'FAA-135-EA2024', 'approved', 'both', 'charter@eliteair.com', '+1-555-345-6789',
      'ARGUS Platinum', JSON.stringify(['mid', 'heavy', 'ultra_long']), JSON.stringify(['west', 'east', 'mainland_hi', 'sw']),
      7000, 1, 1,
    ]);
    const skybridge = await operator(await user('ops@skybridge.com', '+1-555-456-7890', 'Lisa Sky', 'operator'), [
      'SkyBridge Aviation', 'FAA-135-SB2023', 'approved', 'email', 'dispatch@skybridge.com', null,
      'ARGUS Gold', JSON.stringify(['light', 'mid', 'super_mid', 'heavy']), JSON.stringify(['east', 'se', 'central', 'carib']),
      5000, 0, 0,
    ]);
    const pacific = await operator(await user('ops@pacificwings.com', '+1-808-555-1234', 'Kai Pacific', 'operator'), [
      'Pacific Wings Aviation', 'FAA-135-PW2024', 'approved', 'text', null, '+1-808-555-1234',
      'Part 135 Certified', JSON.stringify(['turboprop', 'light', 'mid']), JSON.stringify(['hi_inter', 'mainland_hi', 'pacific']),
      2500, 1, 1,
    ]);
    const westsideUser = await user('ops@westsidejets.com', '+1-310-555-9999', 'Alex West', 'operator');
    await tx.run("INSERT INTO operators (user_id, company_name, status, contact_method) VALUES (?, 'Westside Jets', 'pending', 'email')", [westsideUser]);

    // ── Aircraft ──
    const aircraft = (operatorId: number, tail: string, type: string, capacity: number, range: number, year: number) =>
      id('INSERT INTO aircraft (operator_id, tail_number, type, capacity, range_nm, year) VALUES (?, ?, ?, ?, ?, ?)',
        [operatorId, tail, type, capacity, range, year]);
    const g650 = await aircraft(elite, 'N650EA', 'Gulfstream G650', 14, 7000, 2022);
    await aircraft(elite, 'N560EA', 'Cessna Citation X', 8, 3460, 2019);
    const global = await aircraft(skybridge, 'N900SB', 'Bombardier Global 7500', 17, 7700, 2023);
    await aircraft(skybridge, 'N350SB', 'Embraer Phenom 300E', 6, 2010, 2021);
    await aircraft(pacific, 'N50PW', 'Dassault Falcon 50EX', 9, 3000, 2015);
    await aircraft(pacific, 'N31PW', 'Learjet 31A', 6, 1400, 2012);

    // ── Booking requests (departures in the future) ──
    const leg = (requestId: number, order: number, from: string, to: string, date: string, time: string) =>
      tx.run('INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date, departure_time) VALUES (?, ?, ?, ?, ?, ?)',
        [requestId, order, from, to, date, time]);

    const eastCoast = await id("INSERT INTO booking_requests (customer_id, passenger_count, notes, status) VALUES (?, 4, ?, 'quoted')",
      [john, 'Business trip with luggage. Need WiFi on board.']);
    await leg(eastCoast, 1, 'KTEB', 'KPBI', day(21), '08:00');
    await leg(eastCoast, 2, 'KPBI', 'KMIA', day(24), '14:00');
    await leg(eastCoast, 3, 'KMIA', 'KTEB', day(26), '10:00');

    const hawaii = await id('INSERT INTO booking_requests (customer_id, passenger_count, notes) VALUES (?, 2, ?)',
      [sarah, 'Anniversary trip. Champagne service preferred.']);
    await leg(hawaii, 1, 'KLAX', 'PHNL', day(35), '09:00');
    await leg(hawaii, 2, 'PHNL', 'KLAX', day(42), '16:00');

    // ── Outreach and quotes ──
    const outreach = (requestId: number, operatorId: number, method: string, score: number, subject: string, status: string) =>
      tx.run(`INSERT INTO outreach_log (request_id, operator_id, method, match_score, rfq_subject, rfq_body, status, responded_at)
              VALUES (?, ?, ?, ?, ?, 'New charter request...', ?, ${status === 'responded' ? 'now()' : 'NULL'})`,
        [requestId, operatorId, method, score, subject, status]);
    await outreach(eastCoast, elite, 'both', 85, `Charter Quote Request #${eastCoast} — KTEB → KPBI → KMIA → KTEB`, 'responded');
    await outreach(eastCoast, skybridge, 'email', 72, `Charter Quote Request #${eastCoast} — KTEB → KPBI → KMIA → KTEB`, 'responded');
    await outreach(hawaii, elite, 'both', 90, `Charter Quote Request #${hawaii} — KLAX → PHNL → KLAX`, 'sent');
    await outreach(hawaii, pacific, 'text', 80, `Charter Quote Request #${hawaii} — KLAX → PHNL → KLAX`, 'sent');

    const quote = (requestId: number, operatorId: number, aircraftId: number, cents: number, message: string, validDays: number) =>
      tx.run('INSERT INTO quotes (request_id, operator_id, aircraft_id, price_cents, message, valid_until) VALUES (?, ?, ?, ?, ?, ?)',
        [requestId, operatorId, aircraftId, cents, message, day(validDays)]);
    await quote(eastCoast, elite, g650, 8_500_000, 'G650 available for all three legs. WiFi included. Catering available.', 14);
    await quote(eastCoast, skybridge, global, 9_200_000, 'Global 7500 — ultimate comfort for your trip. Full galley, shower available.', 16);

    // ── Discovered operators (FAA registry sample data) ──
    const discovered: unknown[][] = [
      ['ISLAND AIR CHARTER INC', null, 'I5CA892K', 'ops@islandaircharter.com', '+1-808-555-8100', '155 Kapalulu Pl', 'Honolulu', 'HI', '96819', 'new'],
      ['SUMMIT AVIATION GROUP LLC', 'Summit Jets', 'S3GA501R', 'charter@summitjets.com', '+1-404-555-3200', '1200 Peachtree Industrial Blvd', 'Atlanta', 'GA', '30341', 'emailed'],
      ['TRANS PACIFIC AIRWAYS LLC', null, 'T7CA215N', null, '+1-310-555-4400', '3250 Donald Douglas Loop S', 'Santa Monica', 'CA', '90405', 'no_email'],
      ['MOUNTAIN WEST CHARTER INC', null, 'M2CO876D', null, '+1-303-555-6700', '8000 Tower Rd', 'Denver', 'CO', '80249', 'no_email'],
      ['GULF COAST AVIATION INC', 'Gulf Coast Jets', 'G9TX332P', null, '+1-713-555-1900', '2000 W Sam Houston Pkwy S', 'Houston', 'TX', '77042', 'no_email'],
      ['NORTHEAST AIR LLC', null, 'N4CT118S', null, null, '450 Airport Rd', 'Windsor Locks', 'CT', '06096', 'no_email'],
      ['SUNSHINE STATE CHARTERS INC', null, 'S1FL705M', null, '+1-561-555-2300', '1515 Perimeter Rd', 'West Palm Beach', 'FL', '33406', 'no_email'],
      ['REGIONAL AIR SERVICES INC', null, 'R6OH441J', 'info@regionalairoh.com', '+1-614-555-8800', '4600 International Gtwy', 'Columbus', 'OH', '43219', 'opted_out'],
    ];
    for (const row of discovered) {
      await tx.run(`INSERT INTO discovered_operators
          (company_name, dba_name, certificate_number, contact_email, phone, address, city, state, zip, status, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'faa_registry')`, row);
    }

    return true;
  });
}
