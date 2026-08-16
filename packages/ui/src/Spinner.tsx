export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const SIZE_CLASSES = { sm: 'size-3', md: 'size-4', lg: 'size-6' } as const;

export function Spinner({ size = 'md', label }: SpinnerProps) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <span aria-hidden="true" className={`${SIZE_CLASSES[size]} animate-spin rounded-full border-2 border-current border-t-transparent`} />
      {label !== undefined ? <span>{label}</span> : null}
      <span className="sr-only">{label ?? 'Loading'}</span>
    </span>
  );
}