import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 inline-flex min-h-11 items-center text-display text-ink">
        bespoke<span className="text-brass-ink">.flights</span>
      </Link>
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
