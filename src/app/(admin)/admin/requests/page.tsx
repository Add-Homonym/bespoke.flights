import Link from 'next/link';
import { getDb } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, Thead, Th, Td, Tr } from '@/components/ui/table';
import type { BookingRequest, BookingLeg } from '@/lib/types';

const statusBadge: Record<string, 'default' | 'success' | 'warning' | 'error' | 'gold'> = {
  open: 'gold',
  quoted: 'warning',
  booked: 'success',
  cancelled: 'error',
  completed: 'default',
};

export default async function AdminRequestsPage() {
  const db = getDb();
  const requests = db.prepare(`
    SELECT br.*, u.name as customer_name, u.email as customer_email
    FROM booking_requests br
    JOIN users u ON u.id = br.customer_id
    ORDER BY br.created_at DESC
  `).all() as (BookingRequest & { customer_name: string; customer_email: string })[];

  const getLegs = db.prepare('SELECT * FROM booking_legs WHERE request_id = ? ORDER BY leg_order');
  const getQuoteCount = db.prepare('SELECT COUNT(*) as count FROM quotes WHERE request_id = ?');

  return (
    <div>
      <h1 className="font-display text-3xl text-brand-cream mb-2">All Booking Requests</h1>
      <p className="text-brand-muted mb-10">System-wide booking activity.</p>

      {requests.length === 0 ? (
        <Card>
          <p className="text-brand-muted text-center py-12">No booking requests yet.</p>
        </Card>
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>ID</Th>
              <Th>Route</Th>
              <Th>Customer</Th>
              <Th>Pax</Th>
              <Th>Quotes</Th>
              <Th>Status</Th>
              <Th>Date</Th>
            </tr>
          </Thead>
          <tbody>
            {requests.map(req => {
              const legs = getLegs.all(req.id) as BookingLeg[];
              const quoteCount = (getQuoteCount.get(req.id) as { count: number }).count;
              const route = legs.map(l => l.origin_code).concat(legs[legs.length - 1]?.dest_code).filter(Boolean).join(' → ');

              return (
                <Tr key={req.id}>
                  <Td className="font-mono text-xs">#{req.id}</Td>
                  <Td>
                    <Link href={`/requests/${req.id}`} className="text-brand-cream font-mono hover:text-brand-gold transition-colors">
                      {route}
                    </Link>
                  </Td>
                  <Td>
                    <div className="text-brand-cream text-sm">{req.customer_name}</div>
                    <div className="text-brand-muted text-xs">{req.customer_email}</div>
                  </Td>
                  <Td>{req.passenger_count}</Td>
                  <Td>{quoteCount}</Td>
                  <Td><Badge variant={statusBadge[req.status]}>{req.status}</Badge></Td>
                  <Td className="text-brand-muted text-xs">{new Date(req.created_at).toLocaleDateString()}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
