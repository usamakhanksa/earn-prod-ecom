import { CategoryExplorer } from '@/components/categories/category-explorer';

export default function CategoriesPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-6 space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">
          Real, country-aware categories from marketplace-api — a restricted category (e.g.
          alcohol in Saudi Arabia) is filtered out entirely for that country, not just hidden.
        </p>
      </div>
      <CategoryExplorer />
    </main>
  );
}
