import { getDb } from '@/lib/db';
import { Table, Thead, Th, Td, Tr } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import type { User } from '@/lib/types';

export default async function AdminUsersPage() {
  const db = getDb();
  const users = await db.query<Omit<User, 'password_hash' | 'updated_at'>>('SELECT id, email, phone, name, role, created_at FROM users ORDER BY created_at DESC');

  const roleBadge: Record<string, 'neutral' | 'confirmed' | 'warning'> = {
    customer: 'neutral',
    operator: 'confirmed',
    admin: 'warning',
  };

  return (
    <div>
      <h1 className="font-display text-3xl text-ink mb-2">User Management</h1>
      <p className="text-ink-muted mb-10">All registered users.</p>

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
              <Td className="text-ink-muted">{user.phone || '—'}</Td>
              <Td><StatusBadge variant={roleBadge[user.role]}>{user.role}</StatusBadge></Td>
              <Td className="text-ink-muted text-xs">{new Date(user.created_at).toLocaleDateString()}</Td>
            </Tr>
          ))}
          {users.length === 0 && (
            <Tr>
              <Td className="text-center text-ink-muted py-8">No users yet.</Td>
            </Tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
