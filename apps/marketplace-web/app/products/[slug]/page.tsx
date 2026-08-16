import Link from 'next/link';
import { ProductDetail } from '@/components/products/product-detail';

export default function ProductDetailPage({ params }: { params: { slug: string } }) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/products" className="text-sm text-muted-foreground hover:underline">
        &larr; Back to products
      </Link>
      <div className="mt-4">
        <ProductDetail slug={params.slug} />
      </div>
    </main>
  );
}
