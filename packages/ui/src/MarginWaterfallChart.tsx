export interface WaterfallStep {
  key: string;
  /** i18n key — resolved by the caller's `formatLabel`, keeping this package
   * decoupled from @omnisell/i18n (same pattern as Button/Badge). */
  labelKey: string;
  /** Signed minor-unit string — positive for gross/net, negative for a deduction. */
  amountMinor: string;
}

export interface MarginWaterfallChartProps {
  steps: WaterfallStep[];
  currency: string;
  formatLabel: (labelKey: string) => string;
  formatMoney: (amountMinor: string, currency: string) => string;
  className?: string;
}

interface Bar {
  key: string;
  label: string;
  /** The step's own signed minor-unit amount (not the running-total delta) —
   * this is what gets displayed as the bar's value label. */
  valueMinor: string;
  fromMinor: bigint;
  toMinor: bigint;
  tone: 'gross' | 'deduction' | 'net';
}

const TONE_CLASSES: Record<Bar['tone'], string> = {
  gross: 'bg-brand-500',
  deduction: 'bg-danger/70',
  net: 'bg-success',
};

/**
 * Margin waterfall chart (prompt.md "signature moment #1") — an animated bar
 * decomposing gross -> fees -> print -> ship -> tax -> net. Deliberately
 * hook-free: the grow-in animation is a pure CSS `scaleY` keyframe
 * (`.omnisell-waterfall-bar` in tokens.css) rather than a `useState`-driven
 * two-phase mount, which (a) means `prefers-reduced-motion` is honoured with
 * zero JS via a plain `@media` override, and (b) sidesteps a real dual-
 * package React hazard found while building this component in this sandbox:
 * `packages/ui` resolves its own pinned `react@19.0.0` while `react-dom`
 * hoists to the workspace root's `react@18.3.1` copy (pulled in by
 * `apps/mobile`'s React Native 0.76 pin) — any hook called from a component
 * rendered via `react-dom/server` here throws "Cannot read properties of
 * null (reading 'useState')" because the two 'react' module instances don't
 * share a dispatcher. Recorded as new debt (same root-cause family as
 * docs/DEBT.md 1-D15/1-D16) rather than reworking the pnpm dependency graph,
 * which those entries already flag as a non-trivial, risk-bearing fix.
 */
export function MarginWaterfallChart({ steps, currency, formatLabel, formatMoney, className }: MarginWaterfallChartProps) {
  const bars = buildBars(steps);
  const maxMagnitude = bars.reduce((max, bar) => {
    const magnitudeValue = BigInt(magnitude(bar));
    return magnitudeValue > max ? magnitudeValue : max;
  }, 1n);

  return (
    <div
      className={['rounded-lg border border-border-subtle p-4', className ?? ''].filter(Boolean).join(' ')}
      role="img"
      aria-label={formatLabel('catalog.margin.waterfall.ariaLabel')}
    >
      <div className="flex h-56 items-end justify-between gap-3">
        {bars.map((bar) => {
          const heightPct = (magnitude(bar) * 100) / Number(maxMagnitude);
          const bottomPct = (Number(bar.fromMinor < bar.toMinor ? bar.fromMinor : bar.toMinor) * 100) / Number(maxMagnitude);
          const targetHeight = Math.max(heightPct, 2);
          return (
            <div key={bar.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <span className="text-xs font-medium tabular-nums text-text-primary">{formatMoney(bar.valueMinor, currency)}</span>
              <div className="relative h-full w-full">
                <div
                  className={['omnisell-waterfall-bar absolute inset-x-0 rounded-t-sm', TONE_CLASSES[bar.tone]].join(' ')}
                  style={{ height: `${targetHeight}%`, bottom: `${Math.max(bottomPct, 0)}%` }}
                />
              </div>
              <span className="text-center text-xs text-text-secondary">{formatLabel(bar.label)}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-end text-xs text-text-secondary">{currency}</p>
    </div>
  );
}

function buildBars(steps: WaterfallStep[]): Bar[] {
  const bars: Bar[] = [];
  let running = 0n;
  steps.forEach((step, index) => {
    const value = BigInt(step.amountMinor);
    const isLast = index === steps.length - 1;
    if (index === 0) {
      bars.push({ key: step.key, label: step.labelKey, valueMinor: step.amountMinor, fromMinor: 0n, toMinor: value, tone: 'gross' });
      running = value;
      return;
    }
    if (isLast) {
      bars.push({ key: step.key, label: step.labelKey, valueMinor: step.amountMinor, fromMinor: 0n, toMinor: value, tone: 'net' });
      return;
    }
    const next = running + value;
    bars.push({
      key: step.key,
      label: step.labelKey,
      valueMinor: step.amountMinor,
      fromMinor: running < next ? running : next,
      toMinor: running < next ? next : running,
      tone: 'deduction',
    });
    running = next;
  });
  return bars;
}

function magnitude(bar: Bar): number {
  const diff = bar.toMinor - bar.fromMinor;
  return Number(diff < 0n ? -diff : diff);
}
