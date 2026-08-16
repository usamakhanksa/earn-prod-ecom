import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from '@omnisell/ui';

describe('admin shell uses shared ui primitives', () => {
  it('renders interactive controls with accessible roles', () => {
    const html = renderToString(<Button variant="danger">New announcement</Button>);
    expect(html).toContain('type="button"');
    expect(html).toContain('New announcement');
  });
});