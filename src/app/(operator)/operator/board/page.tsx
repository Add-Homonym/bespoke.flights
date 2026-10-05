import Link from 'next/link';
import { CompanyBoard } from '@/components/board/company-board';

export default function OperatorBoardPage() {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl text-ink mb-2">Company Board</h1>
          <p className="text-ink-muted">Every incoming charter in one place. Updates automatically.</p>
        </div>
        <Link href="/operator/team" className="text-sm text-brass-ink hover:underline">
          Staff alerts &amp; board link &rarr;
        </Link>
      </div>
      <CompanyBoard source="/api/operator/board" linkTrips />
    </div>
  );
}
