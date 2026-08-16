'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Heart, ShoppingCart, Star } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { computeDiscountPercent, formatPrice, formatRating, formatShippingEstimate } from '@/lib/format';

export interface ProductDetailProps {
  slug: string;
}

export function ProductDetail({ slug }: ProductDetailProps) {
  const [country, setCountry] = useState<string>('');

  const detectedCountryQuery = useQuery({
    queryKey: ['country', 'detect'],
    queryFn: () => apiClient.detectCountry(),
  });
  const effectiveCountry = country || detectedCountryQuery.data?.countryCode || '';

  const countriesQuery = useQuery({ queryKey: ['countries'], queryFn: () => apiClient.listCountries() });

  const productQuery = useQuery({
    queryKey: ['product', slug, effectiveCountry],
    queryFn: () => apiClient.getProduct(slug, effectiveCountry || undefined),
    enabled: Boolean(slug),
  });

  if (productQuery.isLoading) {
    return (
      <div className="grid gap-8 md:grid-cols-2" aria-busy="true" aria-live="polite">
        <Skeleton className="aspect-square w-full" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-5 w-1/4" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (productQuery.isError) {
    return (
      <Card role="alert" className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Couldn&apos;t load this product</CardTitle>
          <CardDescription>
            {productQuery.error instanceof Error
              ? productQuery.error.message
              : 'marketplace-api is unreachable.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void productQuery.refetch()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const product = productQuery.data;
  if (!product) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Product not found</CardTitle>
          <CardDescription>
            This product doesn&apos;t exist, or is no longer listed.{' '}
            <Link href="/products" className="underline underline-offset-4">
              Back to products
            </Link>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const discountPercent = computeDiscountPercent(product.price, product.originalPrice);
  const ratingLabel = formatRating(product.rating, product.ratingCount);
  const shippingLabel = formatShippingEstimate(product.shipping);
  const isAvailableHere = effectiveCountry
    ? product.countryAvailability.includes(effectiveCountry.toUpperCase())
    : null;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-secondary">
        {product.images[0] ? (
          <Image
            src={product.images[0]}
            alt={product.name}
            fill
            sizes="(min-width: 768px) 480px, 100vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No image available
          </div>
        )}
      </div>

      <div className="space-y-4">
        {product.category && (
          <Link
            href={`/categories/${product.category.slug}`}
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground hover:underline"
          >
            {product.category.name}
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>

        {ratingLabel && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Star className="h-4 w-4 fill-current" aria-hidden="true" />
            <span>{ratingLabel}</span>
          </div>
        )}

        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold">{formatPrice(product.price, product.currency)}</span>
          {product.originalPrice !== null && discountPercent !== null && (
            <>
              <span className="text-base text-muted-foreground line-through">
                {formatPrice(product.originalPrice, product.currency)}
              </span>
              <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">
                -{discountPercent}%
              </span>
            </>
          )}
        </div>

        {product.description && <p className="text-sm text-muted-foreground">{product.description}</p>}

        <div className="space-y-1.5">
          <label htmlFor="detail-country" className="text-sm font-medium">
            Viewing pricing/shipping for
          </label>
          <select
            id="detail-country"
            className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm"
            value={effectiveCountry}
            onChange={(e) => setCountry(e.target.value)}
          >
            {(countriesQuery.data ?? []).map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {isAvailableHere !== null && (
          <p className={isAvailableHere ? 'text-sm font-medium text-emerald-600 dark:text-emerald-400' : 'text-sm font-medium text-destructive'}>
            {isAvailableHere ? `Available in ${effectiveCountry}` : `Not available in ${effectiveCountry}`}
          </p>
        )}

        <p className="text-sm text-muted-foreground">
          {product.shipping
            ? `Ships to ${product.shipping.countryCode}${shippingLabel ? ` · ${shippingLabel}` : ''}`
            : 'Select a country above to see a shipping estimate.'}
        </p>

        <p className="text-sm text-muted-foreground">
          {product.supplier ? product.supplier.name : 'Supplier info — coming soon (Supplier portal is a later phase).'}
        </p>

        <p className="text-sm text-muted-foreground">
          {product.affiliateCommission !== null
            ? `${(product.affiliateCommission * 100).toFixed(0)}% affiliate commission`
            : 'Affiliate commission — coming soon (Affiliate program is a later phase).'}
        </p>

        <div className="flex gap-3 pt-2">
          <Button disabled title="Cart — coming soon" aria-label="Add to cart (coming soon)">
            <ShoppingCart className="mr-1.5 h-4 w-4" />
            Add to cart
          </Button>
          <Button
            variant="outline"
            disabled
            title="Favorites — coming soon"
            aria-label="Add to favorites (coming soon)"
          >
            <Heart className="mr-1.5 h-4 w-4" />
            Favorite
          </Button>
        </div>
      </div>
    </div>
  );
}
