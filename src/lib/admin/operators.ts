import type { Db } from '@/lib/db';

export interface AdminOperatorRow {
  id: number;
  company_name: string;
  status: 'pending' | 'approved' | 'suspended';
  certificate: string | null;
  contact_method: 'email' | 'text' | 'both';
  contact_email: string | null;
  contact_phone: string | null;
  safety_rating: string | null;
  markets: string | null;
  fleet_types: string | null;
  range_max_nm: number | null;
  notes: string | null;
  platform_fee_bps: number | null;
  created_at: string;
  name: string;
  email: string;
  phone: string | null;
  aircraft_count: number;
}

/** Every operator with its owner's contact and fleet size, pending first. */
export function listOperators(db: Db): Promise<AdminOperatorRow[]> {
  return db.query<AdminOperatorRow>(`
    SELECT o.id, o.company_name, o.status, o.certificate, o.contact_method, o.contact_email, o.contact_phone,
      o.safety_rating, o.markets, o.fleet_types, o.range_max_nm, o.notes, o.platform_fee_bps, o.created_at,
      u.name, u.email, u.phone,
      (SELECT COUNT(*)::int FROM aircraft a WHERE a.operator_id = o.id) AS aircraft_count
    FROM operators o JOIN users u ON u.id = o.user_id
    ORDER BY CASE o.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, o.created_at DESC`);
}
