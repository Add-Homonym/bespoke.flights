export function Table({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-hairline">
      <table className={`w-full text-sm ${className}`}>{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b border-hairline bg-surface-sunken">{children}</thead>;
}

export function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-muted ${className}`}>{children}</th>;
}

export function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-ink ${className}`}>{children}</td>;
}

export function Tr({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <tr className={`border-b border-hairline last:border-0 hover:bg-surface-sunken transition-colors ${className}`}>{children}</tr>;
}
