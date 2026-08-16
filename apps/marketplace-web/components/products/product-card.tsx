import Link from 'next/link';
import Image from 'next/image';
import { Heart, ShoppingCart, Star } from 'lucide-react';
import type { UnifiedProduct } from '@marketplace/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { computeDiscountPercent, formatPrice, formatRating, formatShippingEstimate } from '@/lib/format';

export interface ProductCardProps {
  product: UnifiedProduct;
  /** The country currently being browsed, if any — drives the availability badge. */
  selectedCountryCode?: string | undefined;
}

/**
 * Reusable product card — every field the spec lists: image, title,
 * category, price, original price, discount, currency, rating, supplier,
 * shipping country, shipping estimate, affiliate commission, availability,
 * favorite button, add to cart, view details.
 *
 * Supplier/affiliate/cart/favorite systems don't exist yet (later phases —
 * see docs/marketplace/DEBT.md), so those controls render an honest,
 * visibly-disabled "coming soon" state instead of a button that looks like
 * it works but silently does nothing.
 */
export function ProductCard({ product, selectedCountryCode }: ProductCardProps) {
  const discountPercent = computeDiscountPercent(product.price, product.originalPrice);
  const ratingLabel = formatRating(product.rating, product.ratingCount);
  const shippingLabel = formatShippingEstimate(product.shipping);
  const image = product.images[0];

  const isAvailableHere = selectedCountryCode
    ? product.countryAvailability.includes(selectedCountryCode.toUpperCase())
    : null;

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="relative aspect-square w-full bg-secondary">
        {image ? (
          <Image
            src={image}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 240px, 50vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
        {discountPercent !== null && (
          <span className="absolute left-2 top-2 rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">
            -{discountPercent}%
          </span>
        )}
        <button
          type="button"
          disabled
          title="Favorites — coming soon"
          aria-label="Add to favorites (coming soon)"
          className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 text-muted-foreground opacity-70"
        >
          <Heart className="h-4 w-4" />
        </button>
      </div>

      <CardContent className="flex flex-1 flex-col gap-1.5 p-4">
        {product.category && (
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {product.category.name}
          </span>
        )}
        <Link href={product.url ?? '#'} className="line-clamp-2 font-medium hover:underline">
          {product.name}
        </Link>

        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold">{formatPrice(product.price, product.currency)}</span>
          {product.originalPrice !== null && discountPercent !== null && (
            <span className="text-sm text-muted-foreground line-through">
              {formatPrice(product.originalPrice, product.currency)}
            </span>
          )}
        </div>

        {ratingLabel && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            <span>{ratingLabel}</span>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {product.supplier ? product.supplier.name : 'Supplier info — coming soon'}
        </p>

        {product.shipping ? (
          <p className="text-xs text-muted-foreground">
            Ships to {product.shipping.countryCode}
            {shippingLabel ? ` · ${shippingLabel}` : ''}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Select a country to see shipping estimate</p>
        )}

        <p className="text-xs text-muted-foreground">
          {product.affiliateCommission !== null
            ? `${(product.affiliateCommission * 100).toFixed(0)}% affiliate commission`
            : 'Affiliate commission — coming soon'}
        </p>

        {isAvailableHere !== null && (
          <span
            className={
              isAvailableHere
                ? 'text-xs font-medium text-emerald-600 dark:text-emerald-400'
                : 'text-xs font-medium text-destructive'
            }
          >
            {isAvailableHere ? `Available in ${selectedCountryCode}` : `Not available in ${selectedCountryCode}`}
          </span>
        )}
      </CardContent>

      <CardFooter className="flex gap-2 p-4 pt-0">
        <Button asChild size="sm" variant="outline" className="flex-1">
          <Link href={product.url ?? '#'}>View details</Link>
        </Button>
        <Button
          size="sm"
          className="flex-1"
          disabled
          title="Cart — coming soon"
          aria-label="Add to cart (coming soon)"
        >
          <ShoppingCart className="mr-1.5 h-4 w-4" />
          Add to cart
        </Button>
      </CardFooter>
    </Card>
  );
}
