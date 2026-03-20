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

export interface SessionPayload {
  userId: number;
  role: 'customer' | 'operator' | 'admin';
}
