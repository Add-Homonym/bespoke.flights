import Link from 'next/link';
import { getDb } from '@/lib/db';
import { legsByRequest, quoteCountsByRequest } from '@/lib/db/queries';
import { Card } from '@/components/ui/card';
import { TripDetails } from '@/components/booking/trip-details';
import { fromDbLegs } from '@/lib/trip-format';
import { Badge } from '@/components/ui/badge';
import { Table, Thead, Th, Td, Tr } from '@/components/ui/table';
import type { BookingRequest } from '@/lib/types';

const statusBadge: Record<string, 'default' | 'success' | 'warning' | 'error' | 'gold'> = {
  open: 'gold',
  quoted: 'warning',
  booked: 'success',
  cancelled: 'error',
  completed: 'default',
};

export default async function AdminRequestsPage() {
  const db = getDb();
  const requests = await db.query<BookingRequest & { customer_name: string; customer_email: string }>(`
    SELECT br.*, u.name as customer_name, u.email as customer_email
    FROM booking_requests br
    JOIN users u ON u.id = br.customer_id
    ORDER BY br.created_at DESC
  `);

  const legsByReq = await legsByRequest(db, requests.map(r => r.id));
  const quoteCounts = await quoteCountsByRequest(db, requests.map(r => r.id));

  return (
    <div>
      <h1 className="font-display text-3xl text-ink mb-2">All Booking Requests</h1>
      <p className="text-ink-muted mb-10">System-wide booking activity.</p>

      {requests.length === 0 ? (
        <Card>
          <p className="text-ink-muted text-center py-12">No booking requests yet.</p>
        </Card>
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>ID</Th>
              <Th>Trip</Th>
              <Th>Customer</Th>
              <Th>Quotes</Th>
              <Th>Status</Th>
              <Th>Date</Th>
            </tr>
          </Thead>
          <tbody>
            {requests.map(req => {
              const legs = legsByReq.get(req.id) ?? [];
              const quoteCount = quoteCounts.get(req.id) ?? 0;

              return (
                <Tr key={req.id}>
                  <Td className="font-mono text-xs">#{req.id}</Td>
                  <Td>
                    <Link href={`/requests/${req.id}`} className="block hover:opacity-80 transition-opacity">
                      <TripDetails compact legs={fromDbLegs(legs)} passengerCount={req.passenger_count} notes={req.notes} />
                    </Link>
                  </Td>
                  <Td>
                    <div className="text-ink text-sm">{req.customer_name}</div>
                    <div className="text-ink-muted text-xs">{req.customer_email}</div>
                  </Td>
                  <Td>{quoteCount}</Td>
                  <Td><Badge variant={statusBadge[req.status]}>{req.status}</Badge></Td>
                  <Td className="text-ink-muted text-xs">{new Date(req.created_at).toLocaleDateString()}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
