import { Card } from '@/components/ui/card';

export default function AdminSettingsPage() {
  return (
    <div>
      <h1 className="font-display text-3xl text-ink mb-2">Settings</h1>
      <p className="text-ink-muted mb-10">System configuration.</p>

      <div className="space-y-6">
        <Card>
          <h2 className="text-ink font-semibold mb-4">Platform Settings</h2>
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between py-2 border-b border-hairline">
              <span className="text-ink-muted">Auto-approve operators</span>
              <span className="text-ink">Disabled</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-hairline">
              <span className="text-ink-muted">Default quote validity</span>
              <span className="text-ink">7 days</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-ink-muted">Max legs per request</span>
              <span className="text-ink">10</span>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-ink font-semibold mb-4">Database</h2>
          <p className="text-ink-muted text-sm">Postgres (Neon in production, provisioned through the Vercel integration). Local development without DATABASE_URL uses an embedded PGlite database in data/pglite.</p>
        </Card>
      </div>
    </div>
  );
}
