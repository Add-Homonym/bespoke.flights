import { TeamManager } from '@/components/operator/team-manager';
import { BoardLink } from '@/components/operator/board-link';

export default function OperatorTeamPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-ink mb-2">Team &amp; Alerts</h1>
        <p className="text-ink-muted">
          Staff listed here get automatic emails and texts about your charters. They don&apos;t need an account.
        </p>
      </div>
      <BoardLink />
      <TeamManager />
    </div>
  );
}
