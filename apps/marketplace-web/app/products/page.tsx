import { ProductsExplorer } from '@/components/products/products-explorer';

export default function ProductsPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-6 space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">Products</h1>
        <p className="text-sm text-muted-foreground">
          Real data from marketplace-api, filtered by category, country, price, and rating.
        </p>
      </div>
      <ProductsExplorer />
    </main>
  );
}
