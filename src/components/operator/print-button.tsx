'use client';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-royal px-4 py-2 text-sm font-semibold text-on-royal hover:opacity-90 cursor-pointer"
    >
      Print
    </button>
  );
}
