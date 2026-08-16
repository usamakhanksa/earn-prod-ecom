export interface SkeletonProps {
  className?: string;
  'aria-label'?: string;
}

/** Loading placeholder. Announces `aria-label` when given; otherwise hidden from screen readers. */
export function Skeleton({ className, 'aria-label': ariaLabel }: SkeletonProps) {
  return (
    <div
      aria-hidden={ariaLabel === undefined ? 'true' : undefined}
      aria-label={ariaLabel}
      className={['animate-pulse rounded-md bg-surface-2', className ?? ''].filter(Boolean).join(' ')}
    />
  );
}