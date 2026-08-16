'use client';

import { ListingsListView } from '@/components/listings/listings-list-view';

export default function RejectedPage(): React.JSX.Element {
  return <ListingsListView view="REJECTED_OR_ERROR" titleKey="listings.rejected.title" subtitleKey="listings.rejected.subtitle" />;
}
