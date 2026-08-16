import { describe, expect, it } from 'vitest';
import { cn } from '../lib/utils';

describe('cn (tailwind class merge helper)', () => {
  it('merges class name lists', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('lets a later conflicting Tailwind class win over an earlier one', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, null, 'c')).toBe('a c');
  });
});
