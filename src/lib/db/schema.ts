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
  -- Contact preferences
  contact_method TEXT NOT NULL DEFAULT 'email' CHECK(contact_method IN ('email','text','both')),
  contact_email  TEXT,
  contact_phone  TEXT,
  -- Operator profile for matching
  safety_rating  TEXT,
  fleet_types    TEXT,   -- JSON array: ["light","mid","heavy","ultra_long"]
  markets        TEXT,   -- JSON array: ["hi_inter","mainland_hi","west","east",...]
  range_max_nm   INTEGER,
  hi_capable     INTEGER NOT NULL DEFAULT 0,
  transoceanic   INTEGER NOT NULL DEFAULT 0,
  notes          TEXT,
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

-- Outreach log: tracks every RFQ dispatched to an operator
CREATE TABLE IF NOT EXISTS outreach_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id    INTEGER NOT NULL REFERENCES booking_requests(id),
  operator_id   INTEGER NOT NULL REFERENCES operators(id),
  method        TEXT NOT NULL CHECK(method IN ('email','text','both','pending')),
  match_score   INTEGER NOT NULL DEFAULT 0,
  rfq_subject   TEXT,
  rfq_body      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'sent' CHECK(status IN ('queued','sent','delivered','failed','responded')),
  sent_at       TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at  TEXT,
  UNIQUE(request_id, operator_id)
);

-- Discovered operators: found via FAA registry scrape, pending outreach
CREATE TABLE IF NOT EXISTS discovered_operators (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name       TEXT NOT NULL,
  dba_name           TEXT,
  certificate_number TEXT UNIQUE,
  contact_email      TEXT,
  phone              TEXT,
  address            TEXT,
  city               TEXT,
  state              TEXT,
  zip                TEXT,
  status             TEXT NOT NULL DEFAULT 'new'
                     CHECK(status IN ('new','no_email','emailed','registered','opted_out','bounced')),
  source             TEXT NOT NULL DEFAULT 'faa_registry',
  discovered_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  emailed_at         TEXT,
  invite_resend_id   TEXT,
  notes              TEXT
);

CREATE INDEX IF NOT EXISTS idx_booking_requests_customer ON booking_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_booking_requests_status ON booking_requests(status);
CREATE INDEX IF NOT EXISTS idx_booking_legs_request ON booking_legs(request_id);
CREATE INDEX IF NOT EXISTS idx_quotes_request ON quotes(request_id);
CREATE INDEX IF NOT EXISTS idx_quotes_operator ON quotes(operator_id);
CREATE INDEX IF NOT EXISTS idx_aircraft_operator ON aircraft(operator_id);
CREATE INDEX IF NOT EXISTS idx_outreach_request ON outreach_log(request_id);
CREATE INDEX IF NOT EXISTS idx_outreach_operator ON outreach_log(operator_id);
CREATE INDEX IF NOT EXISTS idx_operators_status ON operators(status);
CREATE INDEX IF NOT EXISTS idx_discovered_status ON discovered_operators(status);
CREATE INDEX IF NOT EXISTS idx_discovered_cert ON discovered_operators(certificate_number);
CREATE INDEX IF NOT EXISTS idx_discovered_state ON discovered_operators(state);
`;
