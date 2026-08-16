'use client';

import { ListingsListView } from '@/components/listings/listings-list-view';

export default function PendingPage(): React.JSX.Element {
  return <ListingsListView status="PENDING" titleKey="listings.pending.title" subtitleKey="listings.pending.subtitle" />;
}
