export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonSize = 'md' | 'sm';

const base =
  'relative inline-flex items-center justify-center gap-2 rounded-md font-sans font-semibold ' +
  'transition-colors duration-200 ease-out cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ' +
  'aria-disabled:opacity-40 aria-disabled:cursor-not-allowed';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-royal text-on-royal hover:opacity-90',
  secondary: 'bg-transparent border border-border-control text-ink hover:bg-surface-sunken',
  quiet: 'bg-transparent text-brass-ink hover:underline underline-offset-4',
  // Destructive confirmation (admin refunds). Not part of the traveler flows.
  danger: 'bg-transparent border border-danger text-danger hover:bg-danger-tint',
};

// The sm button is 40px tall; the pseudo-element extends its hit area to 44px.
const sizes: Record<ButtonSize, string> = {
  md: 'h-[52px] px-6 text-[15px] leading-[22px]',
  sm: 'h-10 px-4 text-[13px] leading-[18px] after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-[""]',
};

export function buttonStyles({
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}): string {
  return [base, variants[variant], sizes[size], block ? 'w-full' : '', className].filter(Boolean).join(' ');
}
