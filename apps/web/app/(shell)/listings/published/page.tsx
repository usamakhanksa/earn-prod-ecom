'use client';

import { ListingsListView } from '@/components/listings/listings-list-view';

export default function PublishedPage(): React.JSX.Element {
  return <ListingsListView status="LIVE" titleKey="listings.published.title" subtitleKey="listings.published.subtitle" />;
}
