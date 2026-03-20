import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <Link href="/" className="flex items-center gap-3 mb-10">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-gold to-brand-accent flex items-center justify-center text-brand-dark font-bold">B</div>
        <span className="font-display text-2xl text-brand-cream">bespoke<span className="text-brand-gold">.flights</span></span>
      </Link>
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
