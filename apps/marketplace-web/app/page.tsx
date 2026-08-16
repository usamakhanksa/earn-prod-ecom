import Link from 'next/link';
import { CountryBadge } from '@/components/country-badge';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">GlobalMart</h1>
        <p className="text-muted-foreground">
          A country-aware global marketplace and monetization platform — Phase 1 vertical
          slice (auth + country detection), running against marketplace-api in MOCK_MODE.
        </p>
      </div>

      <CountryBadge />

      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/register">Create account</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">Sign in</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/products">Browse products</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/categories">Browse categories</Link>
        </Button>
      </div>
    </main>
  );
}
