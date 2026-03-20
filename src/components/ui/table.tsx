export function Table({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-brand-border">
      <table className={`w-full text-sm ${className}`}>{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b border-brand-border bg-brand-navy/50">{children}</thead>;
}

export function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-brand-muted ${className}`}>{children}</th>;
}

export function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-brand-cream ${className}`}>{children}</td>;
}

export function Tr({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <tr className={`border-b border-brand-border/50 last:border-0 hover:bg-brand-slate/30 transition-colors ${className}`}>{children}</tr>;
}
