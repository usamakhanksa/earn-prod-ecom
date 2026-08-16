import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LocaleSwitcher } from '../components/locale-switcher';

describe('LocaleSwitcher', () => {
  it('marks the active locale with aria-pressed', () => {
    const html = renderToString(<LocaleSwitcher current="ar" />);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('lang="ar"');
  });

  it('renders both locales with visible labels', () => {
    const html = renderToString(<LocaleSwitcher current="en" />);
    expect(html).toContain('English');
    expect(html).toContain('العربية');
  });
});