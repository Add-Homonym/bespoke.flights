import Link from 'next/link';
import { Logo } from '@/components/ui/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 inline-flex min-h-11 items-center">
        <Logo size="lg" />
      </Link>
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
