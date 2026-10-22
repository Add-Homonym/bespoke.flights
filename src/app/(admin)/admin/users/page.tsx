import { getDb } from '@/lib/db';
import { requireAdminPage } from '@/lib/admin/guard';
import { UsersManager, type AdminUserRow } from '@/components/admin/users-manager';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const session = await requireAdminPage();
  const users = await getDb().query<AdminUserRow>(`
    SELECT u.id, u.email, u.phone, u.name, u.role, u.created_at, o.id AS operator_id, o.company_name
    FROM users u LEFT JOIN operators o ON o.user_id = u.id
    ORDER BY u.created_at DESC`);

  return (
    <div id="admin-users" className="space-y-8">
      <div>
        <h1 className="text-display text-ink">Users</h1>
        <p className="mt-2 text-body text-ink-muted">Add accounts and change roles. Role changes take effect on the user&apos;s next page load.</p>
      </div>
      <UsersManager initial={users} selfId={session.userId} />
    </div>
  );
}
