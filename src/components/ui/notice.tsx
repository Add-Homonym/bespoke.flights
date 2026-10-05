import type { ReactNode } from 'react';
import { AlertCircle, Check, Clock, Info } from 'lucide-react';

type NoticeTone = 'info' | 'confirmed' | 'warning' | 'danger';

const tones: Record<NoticeTone, { box: string; icon: typeof Info; word: string }> = {
  info: { box: 'border-hairline bg-surface-sunken text-ink', icon: Info, word: '' },
  confirmed: { box: 'border-confirmed bg-confirmed-tint text-confirmed', icon: Check, word: 'Confirmed: ' },
  warning: { box: 'border-warning bg-warning-tint text-warning', icon: Clock, word: 'Notice: ' },
  danger: { box: 'border-danger bg-danger-tint text-danger', icon: AlertCircle, word: 'Error: ' },
};

/**
 * An on-screen message. Status tones always carry an icon and a leading word,
 * never color alone. Errors are announced as alerts, the rest as status.
 */
export function Notice({
  tone = 'info',
  children,
  className = '',
}: {
  tone?: NoticeTone;
  children: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon, word } = tones[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-md border px-4 py-3 text-body ${box} ${className}`}
    >
      <Icon size={24} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
      <p>
        {word && <span className="font-semibold">{word}</span>}
        {children}
      </p>
    </div>
  );
}
