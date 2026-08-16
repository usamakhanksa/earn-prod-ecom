'use client';

import type { CategorySummary, CountryConfigSummary } from '@marketplace/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export interface ProductFiltersValue {
  search: string;
  category: string;
  country: string;
  minPrice: string;
  maxPrice: string;
  minRating: string;
  sort: string;
}

export interface ProductFiltersProps {
  value: ProductFiltersValue;
  onChange: (next: ProductFiltersValue) => void;
  onSubmit: () => void;
  categories: CategorySummary[];
  countries: CountryConfigSummary[];
  /** When set, the category selector is hidden — the category page locks it to one slug. */
  lockedCategorySlug?: string | undefined;
}

/**
 * Real filter controls: category, country, price range, minimum rating,
 * free-text search, sort — wired to GET /api/products' real query params
 * (packages/marketplace-shared's productListQuerySchema), not client-side
 * mock filtering.
 */
export function ProductFilters({
  value,
  onChange,
  onSubmit,
  categories,
  countries,
  lockedCategorySlug,
}: ProductFiltersProps) {
  function set<K extends keyof ProductFiltersValue>(key: K, val: ProductFiltersValue[K]) {
    onChange({ ...value, [key]: val });
  }

  return (
    <form
      className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="space-y-1.5 lg:col-span-2">
        <Label htmlFor="search">Search</Label>
        <Input
          id="search"
          placeholder="Search products…"
          value={value.search}
          onChange={(e) => set('search', e.target.value)}
        />
      </div>

      {!lockedCategorySlug && (
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={value.category}
            onChange={(e) => set('category', e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="country">Country</Label>
        <select
          id="country"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={value.country}
          onChange={(e) => set('country', e.target.value)}
        >
          <option value="">Any country</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="minPrice">Min price</Label>
        <Input
          id="minPrice"
          type="number"
          min={0}
          inputMode="decimal"
          value={value.minPrice}
          onChange={(e) => set('minPrice', e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="maxPrice">Max price</Label>
        <Input
          id="maxPrice"
          type="number"
          min={0}
          inputMode="decimal"
          value={value.maxPrice}
          onChange={(e) => set('maxPrice', e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="minRating">Min rating</Label>
        <select
          id="minRating"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={value.minRating}
          onChange={(e) => set('minRating', e.target.value)}
        >
          <option value="">Any rating</option>
          <option value="4">4+ stars</option>
          <option value="3">3+ stars</option>
          <option value="2">2+ stars</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sort">Sort by</Label>
        <select
          id="sort"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={value.sort}
          onChange={(e) => set('sort', e.target.value)}
        >
          <option value="relevance">Relevance</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="rating">Rating</option>
        </select>
      </div>

      <div className="flex items-end lg:col-span-1">
        <Button type="submit" className="w-full">
          Apply filters
        </Button>
      </div>
    </form>
  );
}
