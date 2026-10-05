'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function OperatorActions({ operatorId, currentStatus }: { operatorId: number; currentStatus: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleAction = async (status: 'approved' | 'suspended') => {
    setLoading(true);
    await fetch(`/api/admin/operators/${operatorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  };

  return (
    <div className="flex gap-3 mt-4 pt-4 border-t border-hairline">
      {currentStatus !== 'approved' && (
        <Button onClick={() => handleAction('approved')} disabled={loading} size="sm">
          Approve
        </Button>
      )}
      {currentStatus !== 'suspended' && (
        <Button onClick={() => handleAction('suspended')} disabled={loading} variant="danger" size="sm">
          Suspend
        </Button>
      )}
    </div>
  );
}
