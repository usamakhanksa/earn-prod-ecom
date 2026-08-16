'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export interface CategoryHeaderProps {
  slug: string;
}

export function CategoryHeader({ slug }: CategoryHeaderProps) {
  const detectedCountryQuery = useQuery({
    queryKey: ['country', 'detect'],
    queryFn: () => apiClient.detectCountry(),
  });

  const categoryQuery = useQuery({
    queryKey: ['category', slug, detectedCountryQuery.data?.countryCode],
    queryFn: () => apiClient.getCategory(slug, detectedCountryQuery.data?.countryCode),
    enabled: detectedCountryQuery.isSuccess,
  });

  if (categoryQuery.isLoading || detectedCountryQuery.isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-live="polite">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (categoryQuery.isError) {
    return (
      <Card role="alert" className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Couldn&apos;t load this category</CardTitle>
          <CardDescription>
            {categoryQuery.error instanceof Error
              ? categoryQuery.error.message
              : 'marketplace-api is unreachable.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void categoryQuery.refetch()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const category = categoryQuery.data;
  if (!category) return null;

  return (
    <div className="space-y-1.5">
      <h1 className="text-2xl font-bold tracking-tight">{category.name}</h1>
      {category.description && <p className="text-sm text-muted-foreground">{category.description}</p>}
      {!category.isAvailable && (
        <p className="text-sm font-medium text-destructive">
          This category isn&apos;t available in your detected country
          {detectedCountryQuery.data ? ` (${detectedCountryQuery.data.countryCode})` : ''}.
        </p>
      )}
    </div>
  );
}
