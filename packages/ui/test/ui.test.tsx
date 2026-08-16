import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge } from '../src/Badge';
import { Button } from '../src/Button';
import { Spinner } from '../src/Spinner';
import { MarginWaterfallChart, type WaterfallStep } from '../src/MarginWaterfallChart';

describe('Button', () => {
  it('renders an accessible button element with correct type', () => {
    const html = renderToString(<Button>Go</Button>);
    expect(html).toContain('type="button"');
  });

  it('disables and announces busy state while loading', () => {
    const html = renderToString(<Button loading>Go</Button>);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled');
  });

  it('passes through aria-label for icon-only use', () => {
    const html = renderToString(<Button aria-label="Close dialog">✕</Button>);
    expect(html).toContain('aria-label="Close dialog"');
  });
});

describe('Badge', () => {
  it('renders children inside a role-agnostic span', () => {
    const html = renderToString(<Badge tone="success">OK</Badge>);
    expect(html).toContain('OK');
  });
});

describe('Spinner', () => {
  it('exposes role=status with a usable label', () => {
    const html = renderToString(<Spinner label="Loading orders" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Loading orders');
  });
});

describe('MarginWaterfallChart', () => {
  const steps: WaterfallStep[] = [
    { key: 'gross', labelKey: 'waterfall.gross', amountMinor: '5000' },
    { key: 'fees', labelKey: 'waterfall.fees', amountMinor: '-500' },
    { key: 'print', labelKey: 'waterfall.print', amountMinor: '-1000' },
    { key: 'net', labelKey: 'waterfall.net', amountMinor: '3500' },
  ];

  it('renders an accessible chart with every bar labelled and formatted', () => {
    const html = renderToString(
      <MarginWaterfallChart
        steps={steps}
        currency="USD"
        formatLabel={(key) => `L:${key}`}
        formatMoney={(minor) => `$${(Number(minor) / 100).toFixed(2)}`}
      />,
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('L:catalog.margin.waterfall.ariaLabel');
    expect(html).toContain('L:waterfall.gross');
    expect(html).toContain('L:waterfall.net');
    expect(html).toContain('$50.00');
    expect(html).toContain('$35.00');
  });

  it('renders one bar per step', () => {
    const html = renderToString(
      <MarginWaterfallChart steps={steps} currency="USD" formatLabel={(key) => key} formatMoney={(minor) => minor} />,
    );
    const barCount = (html.match(/rounded-t-sm/g) ?? []).length;
    expect(barCount).toBe(steps.length);
  });
});