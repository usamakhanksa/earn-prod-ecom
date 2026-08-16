'use client';

import { ListingsListView } from '@/components/listings/listings-list-view';

export default function ScheduledPage(): React.JSX.Element {
  return <ListingsListView view="SCHEDULED" titleKey="listings.scheduled.title" subtitleKey="listings.scheduled.subtitle" />;
}
