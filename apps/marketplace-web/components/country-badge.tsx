'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

/**
 * Proves the country detection vertical slice end-to-end: a real client
 * call to marketplace-api's GET /api/country/detect, with real loading,
 * error and success states (no hardcoded per-country UI branching — the
 * component only ever renders whatever the API's data-driven engine
 * returns).
 */
export function CountryBadge() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['country', 'detect'],
    queryFn: () => apiClient.detectCountry(),
  });

  if (isLoading) {
    return (
      <Card aria-busy="true" aria-live="polite">
        <CardHeader>
          <CardTitle>Detecting your country…</CardTitle>
          <CardDescription>Calling marketplace-api&apos;s country detection engine.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card role="alert" className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Could not detect your country</CardTitle>
          <CardDescription>
            {error instanceof Error ? error.message : 'marketplace-api is unreachable.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm font-medium text-primary underline underline-offset-4"
          >
            Try again
          </button>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No country detected</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {data.countryName} ({data.countryCode})
        </CardTitle>
        <CardDescription>
          Currency: {data.currency} · Language: {data.language} · Timezone: {data.timezone}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {isFetching ? 'Refreshing…' : 'Detected via marketplace-country\'s layered strategy (MOCK_MODE).'}
      </CardContent>
    </Card>
  );
}
