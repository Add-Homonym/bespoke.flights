import { getDb } from './index';
import bcrypt from 'bcryptjs';

export async function seed() {
  const db = getDb();

  // Check if already seeded
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  if (userCount > 0) {
    console.log('Database already seeded, skipping.');
    return;
  }

  const hash = await bcrypt.hash('password123', 12);

  console.log('Seeding database...');

  // Admin
  db.prepare("INSERT INTO users (email, phone, password_hash, name, role) VALUES (?, ?, ?, ?, ?)").run(
    'admin@bespoke.flights', '+1-555-000-0000', hash, 'Admin User', 'admin'
  );

  // Customers
  db.prepare("INSERT INTO users (email, phone, password_hash, name, role) VALUES (?, ?, ?, ?, ?)").run(
    'john@example.com', '+1-555-123-4567', hash, 'John Traveler', 'customer'
  );
  db.prepare("INSERT INTO users (email, phone, password_hash, name, role) VALUES (?, ?, ?, ?, ?)").run(
    'sarah@example.com', '+1-555-234-5678', hash, 'Sarah Williams', 'customer'
  );

  // Operators
  db.prepare("INSERT INTO users (email, phone, password_hash, name, role) VALUES (?, ?, ?, ?, ?)").run(
    'ops@eliteair.com', '+1-555-345-6789', hash, 'Mike Elite', 'operator'
  );
  db.prepare("INSERT INTO operators (user_id, company_name, certificate, status) VALUES (?, ?, ?, ?)").run(
    4, 'Elite Air Charter', 'FAA-135-EA2024', 'approved'
  );

  db.prepare("INSERT INTO users (email, phone, password_hash, name, role) VALUES (?, ?, ?, ?, ?)").run(
    'ops@skybridge.com', '+1-555-456-7890', hash, 'Lisa Sky', 'operator'
  );
  db.prepare("INSERT INTO operators (user_id, company_name, certificate, status) VALUES (?, ?, ?, ?)").run(
    5, 'SkyBridge Aviation', 'FAA-135-SB2023', 'approved'
  );

  // Aircraft for Elite Air
  db.prepare("INSERT INTO aircraft (operator_id, tail_number, type, capacity, range_nm, year) VALUES (?, ?, ?, ?, ?, ?)").run(
    1, 'N650EA', 'Gulfstream G650', 14, 7000, 2022
  );
  db.prepare("INSERT INTO aircraft (operator_id, tail_number, type, capacity, range_nm, year) VALUES (?, ?, ?, ?, ?, ?)").run(
    1, 'N560EA', 'Cessna Citation X', 8, 3460, 2019
  );

  // Aircraft for SkyBridge
  db.prepare("INSERT INTO aircraft (operator_id, tail_number, type, capacity, range_nm, year) VALUES (?, ?, ?, ?, ?, ?)").run(
    2, 'N900SB', 'Bombardier Global 7500', 17, 7700, 2023
  );
  db.prepare("INSERT INTO aircraft (operator_id, tail_number, type, capacity, range_nm, year) VALUES (?, ?, ?, ?, ?, ?)").run(
    2, 'N350SB', 'Embraer Phenom 300E', 6, 2010, 2021
  );

  // Sample booking requests
  db.prepare("INSERT INTO booking_requests (customer_id, passenger_count, notes) VALUES (?, ?, ?)").run(
    2, 4, 'Business trip with luggage. Need WiFi on board.'
  );
  db.prepare("INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date, departure_time) VALUES (?, ?, ?, ?, ?, ?)").run(
    1, 1, 'KTEB', 'KPBI', '2026-04-15', '08:00'
  );
  db.prepare("INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date, departure_time) VALUES (?, ?, ?, ?, ?, ?)").run(
    1, 2, 'KPBI', 'KMIA', '2026-04-18', '14:00'
  );
  db.prepare("INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date, departure_time) VALUES (?, ?, ?, ?, ?, ?)").run(
    1, 3, 'KMIA', 'KTEB', '2026-04-20', '10:00'
  );

  // Second request
  db.prepare("INSERT INTO booking_requests (customer_id, passenger_count, notes) VALUES (?, ?, ?)").run(
    3, 2, 'Anniversary trip. Champagne service preferred.'
  );
  db.prepare("INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date, departure_time) VALUES (?, ?, ?, ?, ?, ?)").run(
    2, 1, 'KLAX', 'PHNL', '2026-05-01', '09:00'
  );
  db.prepare("INSERT INTO booking_legs (request_id, leg_order, origin_code, dest_code, departure_date, departure_time) VALUES (?, ?, ?, ?, ?, ?)").run(
    2, 2, 'PHNL', 'KLAX', '2026-05-08', '16:00'
  );

  // Sample quotes
  db.prepare("INSERT INTO quotes (request_id, operator_id, aircraft_id, price_cents, message, valid_until) VALUES (?, ?, ?, ?, ?, ?)").run(
    1, 1, 1, 8500000, 'G650 available for all three legs. WiFi included. Catering available.', '2026-04-10'
  );
  db.prepare("INSERT INTO quotes (request_id, operator_id, aircraft_id, price_cents, message, valid_until) VALUES (?, ?, ?, ?, ?, ?)").run(
    1, 2, 3, 9200000, 'Global 7500 — ultimate comfort for your trip. Full galley, shower available.', '2026-04-12'
  );

  // Update request status
  db.prepare("UPDATE booking_requests SET status = 'quoted' WHERE id = 1").run();

  console.log('Database seeded successfully!');
  console.log('');
  console.log('Test accounts (all use password: password123):');
  console.log('  Admin:    admin@bespoke.flights');
  console.log('  Customer: john@example.com');
  console.log('  Customer: sarah@example.com');
  console.log('  Operator: ops@eliteair.com (Elite Air Charter)');
  console.log('  Operator: ops@skybridge.com (SkyBridge Aviation)');
}

// Run directly
seed().catch(console.error);
