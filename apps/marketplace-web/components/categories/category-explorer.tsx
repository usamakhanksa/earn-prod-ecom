'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

/**
 * Real /categories experience: country-aware filtering against the
 * country product rule engine (GET /api/categories?country=XX), with real
 * loading/empty/error states — no hardcoded category list.
 */
export function CategoryExplorer() {
  const [country, setCountry] = useState('');
  const [countryWasDefaulted, setCountryWasDefaulted] = useState(false);

  const detectedCountryQuery = useQuery({
    queryKey: ['country', 'detect'],
    queryFn: () => apiClient.detectCountry(),
  });

  useEffect(() => {
    if (!countryWasDefaulted && detectedCountryQuery.data && !country) {
      setCountry(detectedCountryQuery.data.countryCode);
      setCountryWasDefaulted(true);
    }
  }, [detectedCountryQuery.data, countryWasDefaulted, country]);

  const countriesQuery = useQuery({ queryKey: ['countries'], queryFn: () => apiClient.listCountries() });

  const categoriesQuery = useQuery({
    queryKey: ['categories', country],
    queryFn: () => apiClient.listCategories(country ? { country } : {}),
  });

  return (
    <div className="space-y-6">
      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="category-country">Browsing categories for</Label>
        <select
          id="category-country"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        >
          <option value="">Any country</option>
          {(countriesQuery.data ?? []).map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {categoriesQuery.isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true" aria-live="polite">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3] w-full" />
          ))}
        </div>
      )}

      {categoriesQuery.isError && (
        <Card role="alert" className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Couldn&apos;t load categories</CardTitle>
            <CardDescription>
              {categoriesQuery.error instanceof Error
                ? categoriesQuery.error.message
                : 'marketplace-api is unreachable.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => void categoriesQuery.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {!categoriesQuery.isLoading && !categoriesQuery.isError && (categoriesQuery.data?.length ?? 0) === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Nothing here yet</CardTitle>
            <CardDescription>
              {country
                ? 'No categories available in this country yet.'
                : 'No categories are configured yet.'}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!categoriesQuery.isLoading && !categoriesQuery.isError && (categoriesQuery.data?.length ?? 0) > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {categoriesQuery.data!.map((category) => (
            <Link key={category.slug} href={`/categories/${category.slug}`}>
              <Card className="h-full overflow-hidden transition-colors hover:border-primary">
                <div className="relative aspect-[4/3] w-full bg-secondary">
                  {category.imageUrl ? (
                    <Image
                      src={category.imageUrl}
                      alt={category.name}
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
                </div>
                <CardContent className="p-3">
                  <p className="font-medium">{category.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {category.productCount} product{category.productCount === 1 ? '' : 's'}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
