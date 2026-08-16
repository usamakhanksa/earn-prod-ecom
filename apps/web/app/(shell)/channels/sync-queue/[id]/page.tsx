'use client';

import { useParams } from 'next/navigation';
import { PublishPipelineView } from '@/components/listings/publish-pipeline-view';

export default function SyncJobDetailPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-5xl">
      <PublishPipelineView syncJobId={params.id} />
    </div>
  );
}
