'use client';

import { useParams } from 'next/navigation';
import { OrderDetailView } from '@/components/orders/order-detail-view';

export default function OrderDetailPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  return <OrderDetailView orderId={params.id} />;
}
