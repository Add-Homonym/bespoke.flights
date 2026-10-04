import { Card } from '@/components/ui/card';

export default function AdminSettingsPage() {
  return (
    <div>
      <h1 className="font-display text-3xl text-brand-cream mb-2">Settings</h1>
      <p className="text-brand-muted mb-10">System configuration.</p>

      <div className="space-y-6">
        <Card>
          <h2 className="text-brand-cream font-semibold mb-4">Platform Settings</h2>
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between py-2 border-b border-brand-border">
              <span className="text-brand-muted">Auto-approve operators</span>
              <span className="text-brand-cream">Disabled</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-brand-border">
              <span className="text-brand-muted">Default quote validity</span>
              <span className="text-brand-cream">7 days</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-brand-muted">Max legs per request</span>
              <span className="text-brand-cream">10</span>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-brand-cream font-semibold mb-4">Database</h2>
          <p className="text-brand-muted text-sm">Postgres (Neon in production, provisioned through the Vercel integration). Local development without DATABASE_URL uses an embedded PGlite database in data/pglite.</p>
        </Card>
      </div>
    </div>
  );
}
