import { getDb } from './index';
import bcrypt from 'bcryptjs';

export async function seed() {
  const db = getDb();

  if (process.env.DATABASE_URL && process.env.SEED_DATABASE !== 'yes') {
    // Seed data includes accounts with a known password. Never load it into a
    // shared database by accident (e.g. after `vercel env pull`).
    throw new Error('DATABASE_URL is set. Re-run with SEED_DATABASE=yes to seed that database.');
  }

  const userCount = (await db.one<{ count: number }>('SELECT COUNT(*) as count FROM users'))!.count;
  if (userCount > 0) {
    console.log('Database already seeded, skipping.');
    return;
  }

  const hash = await bcrypt.hash('password123', 12);
  console.log('Seeding database...');

  // ── Admin ──
  await db.run("INSERT INTO users (email, phone, password_hash, name, role) VALUES (?, ?, ?, ?, ?)", ['admin@bespoke.flights', '+1-555-000-0000', hash, 'Admin User', 'admin']);

  // ── Customers ──
  await db.run("INSERT INTO users (email, phone, password_hash, name, role) VALUES (?, ?, ?, ?, ?)", ['john@example.com', '+1-555-123-4567', hash, 'John Traveler', 'customer']);
  await db.run("INSERT INTO users (email, phone, password_hash, name, role) VALUES (?, ?, ?, ?, ?)", ['sarah@example.com', '+1-555-234-5678', hash, 'Sarah Williams', 'customer']);

  // ── Operator 1: Elite Air Charter (approved, full profile) ──
  await db.run("INSERT INTO users (email, phone, password_hash, name, role) VALUES (?, ?, ?, ?, ?)", ['ops@eliteair.com', '+1-555-345-6789', hash, 'Mike Elite', 'operator']);
  await db.run(`INSERT INTO operators (user_id, company_name, certificate, status, contact_method, contact_email, contact_phone, safety_rating, fleet_types, markets, range_max_nm, hi_capable, transoceanic)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [4, 'Elite Air Charter', 'FAA-135-EA2024', 'approved',
    'both', 'charter@eliteair.com', '+1-555-345-6789',
    'ARGUS Platinum',
    JSON.stringify(['mid', 'heavy', 'ultra_long']),
    JSON.stringify(['west', 'east', 'mainland_hi', 'sw']),
    7000, 1, 1]);

  // ── Operator 2: SkyBridge Aviation (approved, full profile) ──
  await db.run("INSERT INTO users (email, phone, password_hash, name, role) VALUES (?, ?, ?, ?, ?)", ['ops@skybridge.com', '+1-555-456-7890', hash, 'Lisa Sky', 'operator']);
  await db.run(`INSERT INTO operators (user_id, company_name, certificate, status, contact_method, contact_email, contact_phone, safety_rating, fleet_types, markets, range_max_nm, hi_capable, transoceanic)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [5, 'SkyBridge Aviation', 'FAA-135-SB2023', 'approved',
    'email', 'dispatch@skybridge.com', null,
    'ARGUS Gold',
    JSON.stringify(['light', 'mid', 'super_mid', 'heavy']),
    JSON.stringify(['east', 'se', 'central', 'carib']),
    5000, 0, 0]);

  // ── Operator 3: Pacific Wings (approved, Hawaii specialist) ──
  await db.run("INSERT INTO users (email, phone, password_hash, name, role) VALUES (?, ?, ?, ?, ?)", ['ops@pacificwings.com', '+1-808-555-1234', hash, 'Kai Pacific', 'operator']);
  await db.run(`INSERT INTO operators (user_id, company_name, certificate, status, contact_method, contact_email, contact_phone, safety_rating, fleet_types, markets, range_max_nm, hi_capable, transoceanic)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [6, 'Pacific Wings Aviation', 'FAA-135-PW2024', 'approved',
    'text', null, '+1-808-555-1234',
    'Part 135 Certified',
    JSON.stringify(['turboprop', 'light', 'mid']),
    JSON.stringify(['hi_inter', 'mainland_hi', 'pacific']),
    2500, 1, 1]);

  // ── Operator 4: Westside Jets (pending, no profile yet) ──
  await db.run("INSERT INTO users (email, phone, password_hash, name, role) VALUES (?, ?, ?, ?, ?)", ['ops@westsidejets.com', '+1-310-555-9999', hash, 'Alex West', 'operator']);
  await db.run(`INSERT INTO operators (user_id, company_name, status, contact_method)
    VALUES (?, ?, ?, ?)`, [7, 'Westside Jets', 'pending', 'email']);

  // ── Aircraft ──
  await db.run("INSERT INTO aircraft (operator_id, tail_number, type, capacity, range_nm, year) VALUES (?, ?, ?, ?, ?, ?)", [1, 'N650EA', 'Gulfstream G650', 14, 7000, 2022]);
  await db.run("INSERT INTO aircraft (operator_id, tail_number, type, capacity, range_nm, year) VALUES (?, ?, ?, ?, ?, ?)", [1, 'N560EA', 'Cessna Citation X', 8, 3460, 2019]);
  await db.run("INSERT INTO aircraft (operator_id, tail_number, type, capacity, range_nm, year) VALUES (?, ?, ?, ?, ?, ?)", [2, 'N900SB', 'Bombardier Global 7500', 17, 7700, 2023]);
  await db.run("INSERT INTO aircraft (operator_id, tail_number, type, capacity, range_nm, year) VALUES (?, ?, ?, ?, ?, ?)", [2, 'N350SB', 'Embraer Phenom 300E', 6, 2010, 2021]);
  await db.run("INSERT INTO aircraft (operator_id, tail_number, type, capacity, range_nm, year) VALUES (?, ?, ?, ?, ?, ?)", [3, 'N50PW', 'Dassault Falcon 50EX', 9, 3000, 2015]);
  await db.run("INSERT INTO aircraft (operator_id, tail_number, type, capacity, range_nm, year) VALUES (?, ?, ?, ?, ?, ?)", [3, 'N31PW', 'Learjet 31A', 6, 1400, 2012]);

  // ── Sample booking requests ──
  await db.run("INSERT INTO booking_requests (customer_id, passenger_count, notes) VALUES (?, ?, ?)", [2, 4, 'Business trip with luggage. Need WiFi on board.']);
  await db.run("INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date, departure_time) VALUES (?, ?, ?, ?, ?, ?)", [1, 1, 'KTEB', 'KPBI', '2026-04-15', '08:00']);
  await db.run("INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date, departure_time) VALUES (?, ?, ?, ?, ?, ?)", [1, 2, 'KPBI', 'KMIA', '2026-04-18', '14:00']);
  await db.run("INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date, departure_time) VALUES (?, ?, ?, ?, ?, ?)", [1, 3, 'KMIA', 'KTEB', '2026-04-20', '10:00']);

  await db.run("INSERT INTO booking_requests (customer_id, passenger_count, notes) VALUES (?, ?, ?)", [3, 2, 'Anniversary trip. Champagne service preferred.']);
  await db.run("INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date, departure_time) VALUES (?, ?, ?, ?, ?, ?)", [2, 1, 'KLAX', 'PHNL', '2026-05-01', '09:00']);
  await db.run("INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date, departure_time) VALUES (?, ?, ?, ?, ?, ?)", [2, 2, 'PHNL', 'KLAX', '2026-05-08', '16:00']);

  // ── Outreach logs ──
  await db.run(`INSERT INTO outreach_log (request_id, operator_id, method, match_score, rfq_subject, rfq_body, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [1, 1, 'both', 85, 'Charter Quote Request #1 — KTEB → KPBI → KMIA → KTEB',
    'New charter request...', 'sent']);
  await db.run(`INSERT INTO outreach_log (request_id, operator_id, method, match_score, rfq_subject, rfq_body, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [1, 2, 'email', 72, 'Charter Quote Request #1 — KTEB → KPBI → KMIA → KTEB',
    'New charter request...', 'sent']);
  await db.run(`INSERT INTO outreach_log (request_id, operator_id, method, match_score, rfq_subject, rfq_body, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [2, 1, 'both', 90, 'Charter Quote Request #2 — KLAX → PHNL → KLAX',
    'New charter request...', 'sent']);
  await db.run(`INSERT INTO outreach_log (request_id, operator_id, method, match_score, rfq_subject, rfq_body, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [2, 3, 'text', 80, 'Charter Quote Request #2 — KLAX → PHNL → KLAX',
    'New charter request...', 'sent']);

  // Sample quotes (valid two weeks from seeding so they can be paid)
  const validUntil = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  await db.run("INSERT INTO quotes (request_id, operator_id, aircraft_id, price_cents, message, valid_until) VALUES (?, ?, ?, ?, ?, ?)", [1, 1, 1, 8500000, 'G650 available for all three legs. WiFi included. Catering available.', validUntil(14)]);
  await db.run("INSERT INTO quotes (request_id, operator_id, aircraft_id, price_cents, message, valid_until) VALUES (?, ?, ?, ?, ?, ?)", [1, 2, 3, 9200000, 'Global 7500 — ultimate comfort for your trip. Full galley, shower available.', validUntil(16)]);

  await db.run("UPDATE outreach_log SET status = 'responded', responded_at = now() WHERE request_id = 1 AND operator_id IN (1, 2)");
  await db.run("UPDATE booking_requests SET status = 'quoted' WHERE id = 1");

  // ── Discovered Operators (FAA registry sample data) ──
  const insertDiscovered = (...values: unknown[]) => db.run(`
    INSERT INTO discovered_operators
      (company_name, dba_name, certificate_number, contact_email, phone, address, city, state, zip, status, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, values);

  // Has email, ready to send invite
  await insertDiscovered(
    'ISLAND AIR CHARTER INC', null, 'I5CA892K',
    'ops@islandaircharter.com', '+1-808-555-8100',
    '155 Kapalulu Pl', 'Honolulu', 'HI', '96819',
    'new', 'faa_registry'
  );

  // Has email, already emailed
  await insertDiscovered(
    'SUMMIT AVIATION GROUP LLC', 'Summit Jets', 'S3GA501R',
    'charter@summitjets.com', '+1-404-555-3200',
    '1200 Peachtree Industrial Blvd', 'Atlanta', 'GA', '30341',
    'emailed', 'faa_registry'
  );

  // No email — admin needs to find it
  await insertDiscovered(
    'TRANS PACIFIC AIRWAYS LLC', null, 'T7CA215N',
    null, '+1-310-555-4400',
    '3250 Donald Douglas Loop S', 'Santa Monica', 'CA', '90405',
    'no_email', 'faa_registry'
  );
  await insertDiscovered(
    'MOUNTAIN WEST CHARTER INC', null, 'M2CO876D',
    null, '+1-303-555-6700',
    '8000 Tower Rd', 'Denver', 'CO', '80249',
    'no_email', 'faa_registry'
  );
  await insertDiscovered(
    'GULF COAST AVIATION INC', 'Gulf Coast Jets', 'G9TX332P',
    null, '+1-713-555-1900',
    '2000 W Sam Houston Pkwy S', 'Houston', 'TX', '77042',
    'no_email', 'faa_registry'
  );
  await insertDiscovered(
    'NORTHEAST AIR LLC', null, 'N4CT118S',
    null, null,
    '450 Airport Rd', 'Windsor Locks', 'CT', '06096',
    'no_email', 'faa_registry'
  );
  await insertDiscovered(
    'SUNSHINE STATE CHARTERS INC', null, 'S1FL705M',
    null, '+1-561-555-2300',
    '1515 Perimeter Rd', 'West Palm Beach', 'FL', '33406',
    'no_email', 'faa_registry'
  );

  // Opted out
  await insertDiscovered(
    'REGIONAL AIR SERVICES INC', null, 'R6OH441J',
    'info@regionalairoh.com', '+1-614-555-8800',
    '4600 International Gtwy', 'Columbus', 'OH', '43219',
    'opted_out', 'faa_registry'
  );

  console.log('Database seeded successfully!');
  console.log('');
  console.log('Test accounts (all use password: password123):');
  console.log('  Admin:    admin@bespoke.flights');
  console.log('  Customer: john@example.com');
  console.log('  Customer: sarah@example.com');
  console.log('  Operator: ops@eliteair.com     (Elite Air Charter — approved, full profile)');
  console.log('  Operator: ops@skybridge.com     (SkyBridge Aviation — approved, full profile)');
  console.log('  Operator: ops@pacificwings.com  (Pacific Wings — approved, Hawaii specialist)');
  console.log('  Operator: ops@westsidejets.com  (Westside Jets — pending approval)');
  console.log('');
  console.log('Discovered operators: 8 (1 ready, 1 emailed, 5 need email, 1 opted out)');
}

seed()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
