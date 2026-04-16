export interface User {
  id: number;
  email: string;
  phone: string | null;
  password_hash: string;
  name: string;
  role: 'customer' | 'operator' | 'admin';
  created_at: string;
  updated_at: string;
}

export interface Operator {
  id: number;
  user_id: number;
  company_name: string;
  certificate: string | null;
  status: 'pending' | 'approved' | 'suspended';
  contact_method: 'email' | 'text' | 'both';
  contact_email: string | null;
  contact_phone: string | null;
  safety_rating: string | null;
  fleet_types: string | null;   // JSON array
  markets: string | null;       // JSON array
  range_max_nm: number | null;
  hi_capable: number;
  transoceanic: number;
  notes: string | null;
  created_at: string;
}

export interface Aircraft {
  id: number;
  operator_id: number;
  tail_number: string;
  type: string;
  capacity: number;
  range_nm: number | null;
  year: number | null;
  created_at: string;
}

export interface BookingRequest {
  id: number;
  customer_id: number;
  status: 'open' | 'quoted' | 'booked' | 'cancelled' | 'completed';
  passenger_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingLeg {
  id: number;
  request_id: number;
  leg_order: number;
  origin_code: string;
  origin_name: string | null;
  dest_code: string;
  dest_name: string | null;
  departure_date: string;
  departure_time: string | null;
}

export interface Quote {
  id: number;
  request_id: number;
  operator_id: number;
  aircraft_id: number | null;
  price_cents: number;
  currency: string;
  message: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  valid_until: string | null;
  created_at: string;
}

export interface OutreachLog {
  id: number;
  request_id: number;
  operator_id: number;
  method: 'email' | 'text' | 'both' | 'pending';
  match_score: number;
  rfq_subject: string | null;
  rfq_body: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'responded';
  sent_at: string;
  responded_at: string | null;
}

export interface SessionPayload {
  userId: number;
  role: 'customer' | 'operator' | 'admin';
}

// Market keys used for matching
export type MarketKey =
  | 'hi_inter' | 'mainland_hi' | 'west' | 'east'
  | 'se' | 'central' | 'sw' | 'carib' | 'transatl' | 'pacific';

export const MARKET_LABELS: Record<MarketKey, string> = {
  hi_inter: 'Hawaii Inter-Island',
  mainland_hi: 'Mainland → Hawaii',
  west: 'US West Coast',
  east: 'US East Coast',
  se: 'US Southeast',
  central: 'US Central / Midwest',
  sw: 'US Southwest',
  carib: 'Caribbean / Latin America',
  transatl: 'Transatlantic',
  pacific: 'Pacific Islands',
};

export const FLEET_TYPE_LABELS: Record<string, string> = {
  vlj: 'Very Light Jet (1–4 pax)',
  turboprop: 'Turboprop (4–9 pax)',
  light: 'Light Jet (4–6 pax)',
  mid: 'Midsize Jet (6–8 pax)',
  super_mid: 'Super-Midsize (8–10 pax)',
  heavy: 'Heavy Jet (10–14 pax)',
  ultra_long: 'Ultra-Long Range (8–16 pax)',
};

export const SAFETY_RATINGS = [
  'ARGUS Platinum',
  'ARGUS Gold',
  'Wyvern Wingman',
  'IS-BAO Stage 3',
  'IS-BAO Stage 2',
  'Part 135 Certified',
] as const;
