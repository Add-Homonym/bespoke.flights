export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK(role IN ('customer','operator','admin')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS operators (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL UNIQUE REFERENCES users(id),
  company_name  TEXT NOT NULL,
  certificate   TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','suspended')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS aircraft (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  operator_id   INTEGER NOT NULL REFERENCES operators(id),
  tail_number   TEXT NOT NULL,
  type          TEXT NOT NULL,
  capacity      INTEGER NOT NULL,
  range_nm      INTEGER,
  year          INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS booking_requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id     INTEGER NOT NULL REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK(status IN ('open','quoted','booked','cancelled','completed')),
  passenger_count INTEGER NOT NULL DEFAULT 1,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS booking_legs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id      INTEGER NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  leg_order       INTEGER NOT NULL,
  origin_code     TEXT NOT NULL,
  origin_name     TEXT,
  dest_code       TEXT NOT NULL,
  dest_name       TEXT,
  departure_date  TEXT NOT NULL,
  departure_time  TEXT,
  UNIQUE(request_id, leg_order)
);

CREATE TABLE IF NOT EXISTS quotes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id    INTEGER NOT NULL REFERENCES booking_requests(id),
  operator_id   INTEGER NOT NULL REFERENCES operators(id),
  aircraft_id   INTEGER REFERENCES aircraft(id),
  price_cents   INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','accepted','rejected','withdrawn')),
  valid_until   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_booking_requests_customer ON booking_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_booking_requests_status ON booking_requests(status);
CREATE INDEX IF NOT EXISTS idx_booking_legs_request ON booking_legs(request_id);
CREATE INDEX IF NOT EXISTS idx_quotes_request ON quotes(request_id);
CREATE INDEX IF NOT EXISTS idx_quotes_operator ON quotes(operator_id);
CREATE INDEX IF NOT EXISTS idx_aircraft_operator ON aircraft(operator_id);
`;
