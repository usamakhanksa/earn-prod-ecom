import Link from 'next/link';
import { CategoryHeader } from '@/components/categories/category-header';
import { ProductsExplorer } from '@/components/products/products-explorer';

export default function CategoryDetailPage({ params }: { params: { slug: string } }) {
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <Link href="/categories" className="text-sm text-muted-foreground hover:underline">
        &larr; Back to categories
      </Link>
      <div className="mt-4 mb-6">
        <CategoryHeader slug={params.slug} />
      </div>
      <ProductsExplorer lockedCategorySlug={params.slug} />
    </main>
  );
}
