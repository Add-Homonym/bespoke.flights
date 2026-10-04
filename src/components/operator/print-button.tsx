'use client';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-brand-accent cursor-pointer"
    >
      Print
    </button>
  );
}
