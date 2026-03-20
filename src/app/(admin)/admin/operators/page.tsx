import { getDb } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { OperatorActions } from '@/components/admin/operator-actions';
import type { Operator } from '@/lib/types';

export default async function AdminOperatorsPage() {
  const db = getDb();

  const operators = db.prepare(`
    SELECT o.*, u.name, u.email, u.phone
    FROM operators o
    JOIN users u ON u.id = o.user_id
    ORDER BY
      CASE o.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
      o.created_at DESC
  `).all() as (Operator & { name: string; email: string; phone: string | null })[];

  const statusBadge: Record<string, 'warning' | 'success' | 'error'> = {
    pending: 'warning',
    approved: 'success',
    suspended: 'error',
  };

  return (
    <div>
      <h1 className="font-display text-3xl text-brand-cream mb-2">Operator Management</h1>
      <p className="text-brand-muted mb-10">Approve or manage charter operators.</p>

      {operators.length === 0 ? (
        <Card>
          <p className="text-brand-muted text-center py-12">No operators registered yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {operators.map(op => (
            <Card key={op.id} className={op.status === 'pending' ? 'border-brand-warning/30' : ''}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-brand-cream font-semibold text-lg">{op.company_name}</h3>
                  <p className="text-brand-muted text-sm mt-1">{op.name} &middot; {op.email}</p>
                  {op.phone && <p className="text-brand-muted text-xs mt-1">{op.phone}</p>}
                  {op.certificate && <p className="text-brand-muted text-xs mt-1">Cert: {op.certificate}</p>}
                  <p className="text-brand-muted/50 text-xs mt-2">Registered {new Date(op.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={statusBadge[op.status]}>{op.status}</Badge>
                </div>
              </div>
              <OperatorActions operatorId={op.id} currentStatus={op.status} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
