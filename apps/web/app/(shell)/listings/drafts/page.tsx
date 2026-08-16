'use client';

import { ListingsListView } from '@/components/listings/listings-list-view';

export default function DraftsPage(): React.JSX.Element {
  return <ListingsListView status="DRAFT" titleKey="listings.drafts.title" subtitleKey="listings.drafts.subtitle" />;
}
