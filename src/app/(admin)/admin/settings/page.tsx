import { Card } from '@/components/ui/card';
import { requireAdminPage } from '@/lib/admin/guard';
import { BusinessModelForm } from '@/components/admin/business-model-form';
import { getDb } from '@/lib/db';
import { APPLIED_FIELDS, getBusinessModel } from '@/lib/business-model';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await requireAdminPage();
  const model = await getBusinessModel(getDb());

  return (
    <div>
      <h1 className="text-display text-ink mb-2">Settings</h1>
      <p className="text-body text-ink-muted mb-10">
        Business model. Changes apply to new checkouts; existing payments keep the split they were created with.
        A per-operator fee set on the Operators page overrides every commission rule here.
      </p>

      <BusinessModelForm initial={model} applied={[...APPLIED_FIELDS]} />

      <Card className="mt-6">
        <h2 className="text-title text-ink mb-2">Database</h2>
        <p className="text-body text-ink-muted">Postgres (Neon in production, provisioned through the Vercel integration). Local development without DATABASE_URL uses an embedded PGlite database in data/pglite.</p>
      </Card>
    </div>
  );
}
