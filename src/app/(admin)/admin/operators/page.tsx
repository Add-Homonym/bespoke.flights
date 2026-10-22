import { getDb } from '@/lib/db';
import { requireAdminPage } from '@/lib/admin/guard';
import { listOperators } from '@/lib/admin/operators';
import { OperatorsManager } from '@/components/admin/operators-manager';

export const dynamic = 'force-dynamic';

export default async function AdminOperatorsPage() {
  await requireAdminPage();
  const operators = await listOperators(getDb());
  return (
    <div id="admin-operators" className="space-y-8">
      <div>
        <h1 className="text-display text-ink">Operators</h1>
        <p className="mt-2 text-body text-ink-muted">Add operators, approve or suspend them, and edit their company profile.</p>
      </div>
      <OperatorsManager initial={operators} />
    </div>
  );
}
