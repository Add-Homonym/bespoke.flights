import { getDb } from '@/lib/db';
import { Table, Thead, Th, Td, Tr } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { User } from '@/lib/types';

export default async function AdminUsersPage() {
  const db = getDb();
  const users = await db.query<Omit<User, 'password_hash' | 'updated_at'>>('SELECT id, email, phone, name, role, created_at FROM users ORDER BY created_at DESC');

  const roleBadge: Record<string, 'gold' | 'success' | 'warning'> = {
    customer: 'gold',
    operator: 'success',
    admin: 'warning',
  };

  return (
    <div>
      <h1 className="font-display text-3xl text-brand-cream mb-2">User Management</h1>
      <p className="text-brand-muted mb-10">All registered users.</p>

      <Table>
        <Thead>
          <tr>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Phone</Th>
            <Th>Role</Th>
            <Th>Joined</Th>
          </tr>
        </Thead>
        <tbody>
          {users.map(user => (
            <Tr key={user.id}>
              <Td>{user.name}</Td>
              <Td className="font-mono text-xs">{user.email}</Td>
              <Td className="text-brand-muted">{user.phone || '—'}</Td>
              <Td><Badge variant={roleBadge[user.role]}>{user.role}</Badge></Td>
              <Td className="text-brand-muted text-xs">{new Date(user.created_at).toLocaleDateString()}</Td>
            </Tr>
          ))}
          {users.length === 0 && (
            <Tr>
              <Td className="text-center text-brand-muted py-8">No users yet.</Td>
            </Tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
