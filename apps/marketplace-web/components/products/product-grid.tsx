import type { UnifiedProduct } from '@marketplace/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProductCard } from './product-card';

export interface ProductGridProps {
  items: UnifiedProduct[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  selectedCountryCode?: string | undefined;
  /** Shown when the query succeeded but returned zero products. */
  emptyMessage: string;
}

/** Real loading skeleton, error+retry, empty state, and success grid — used by every product listing surface. */
export function ProductGrid({
  items,
  isLoading,
  isError,
  error,
  onRetry,
  selectedCountryCode,
  emptyMessage,
}: ProductGridProps) {
  if (isLoading) {
    return (
      <div
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
        aria-busy="true"
        aria-live="polite"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card role="alert" className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Couldn&apos;t load products</CardTitle>
          <CardDescription>
            {error instanceof Error ? error.message : 'marketplace-api is unreachable.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!items || items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nothing here yet</CardTitle>
          <CardDescription>{emptyMessage}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((product) => (
        <ProductCard key={product.id} product={product} selectedCountryCode={selectedCountryCode} />
      ))}
    </div>
  );
}
