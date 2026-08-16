'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ProductSort } from '@marketplace/shared';
import { apiClient } from '@/lib/api-client';
import { ProductFilters, type ProductFiltersValue } from './product-filters';
import { ProductGrid } from './product-grid';
import { Pagination } from './pagination';

export interface ProductsExplorerProps {
  /** Locks the category filter to one slug and hides the category selector — used by /categories/[slug]. */
  lockedCategorySlug?: string;
}

const PAGE_SIZE = 12;

const EMPTY_FILTERS: ProductFiltersValue = {
  search: '',
  category: '',
  country: '',
  minPrice: '',
  maxPrice: '',
  minRating: '',
  sort: 'relevance',
};

/**
 * Orchestrates the real /products experience: filters (category/country/
 * price/rating/search), pagination, and every loading/empty/error state —
 * all backed by real calls to marketplace-api (MOCK_MODE-backed in this
 * sandbox), never a hardcoded array.
 */
export function ProductsExplorer({ lockedCategorySlug }: ProductsExplorerProps) {
  const [filters, setFilters] = useState<ProductFiltersValue>({
    ...EMPTY_FILTERS,
    category: lockedCategorySlug ?? '',
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [page, setPage] = useState(1);
  const [countryWasDefaulted, setCountryWasDefaulted] = useState(false);

  const detectedCountryQuery = useQuery({
    queryKey: ['country', 'detect'],
    queryFn: () => apiClient.detectCountry(),
  });

  // Default the country filter to the visitor's detected country exactly
  // once — never overrides a country the shopper picked themselves.
  useEffect(() => {
    if (!countryWasDefaulted && detectedCountryQuery.data && !filters.country) {
      const code = detectedCountryQuery.data.countryCode;
      setFilters((f) => ({ ...f, country: code }));
      setAppliedFilters((f) => ({ ...f, country: code }));
      setCountryWasDefaulted(true);
    }
  }, [detectedCountryQuery.data, countryWasDefaulted, filters.country]);

  const countriesQuery = useQuery({
    queryKey: ['countries'],
    queryFn: () => apiClient.listCountries(),
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories', appliedFilters.country],
    queryFn: () =>
      apiClient.listCategories(appliedFilters.country ? { country: appliedFilters.country } : {}),
    enabled: !lockedCategorySlug,
  });

  const effectiveCategory = lockedCategorySlug ?? (appliedFilters.category || undefined);

  const productsQuery = useQuery({
    queryKey: ['products', appliedFilters, page, lockedCategorySlug],
    queryFn: () =>
      apiClient.listProducts({
        search: appliedFilters.search || undefined,
        category: effectiveCategory,
        country: appliedFilters.country || undefined,
        minPrice: appliedFilters.minPrice ? Number(appliedFilters.minPrice) : undefined,
        maxPrice: appliedFilters.maxPrice ? Number(appliedFilters.maxPrice) : undefined,
        minRating: appliedFilters.minRating ? Number(appliedFilters.minRating) : undefined,
        sort: appliedFilters.sort as ProductSort,
        page,
        limit: PAGE_SIZE,
      }),
  });

  function handleApply() {
    setAppliedFilters(filters);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <ProductFilters
        value={filters}
        onChange={setFilters}
        onSubmit={handleApply}
        categories={categoriesQuery.data ?? []}
        countries={countriesQuery.data ?? []}
        lockedCategorySlug={lockedCategorySlug}
      />

      <ProductGrid
        items={productsQuery.data?.items}
        isLoading={productsQuery.isLoading}
        isError={productsQuery.isError}
        error={productsQuery.error}
        onRetry={() => void productsQuery.refetch()}
        selectedCountryCode={appliedFilters.country || undefined}
        emptyMessage={
          appliedFilters.country
            ? 'No products available in this country yet.'
            : 'No products match your filters — try adjusting search, category, or price range.'
        }
      />

      {productsQuery.data && (
        <Pagination
          page={page}
          limit={productsQuery.data.limit}
          total={productsQuery.data.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
