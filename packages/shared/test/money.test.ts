import { describe, expect, it } from 'vitest';
import { amountMinorSchema, currencyCodeSchema, toMinor } from '../src/money';

describe('toMinor', () => {
  it('converts whole units to minor units', () => {
    expect(toMinor('30').toString()).toBe('3000');
    expect(toMinor('0').toString()).toBe('0');
  });

  it('converts two-decimal amounts', () => {
    expect(toMinor('12.34').toString()).toBe('1234');
    expect(toMinor('0.05').toString()).toBe('5');
  });

  it('pads a single decimal place', () => {
    expect(toMinor('7.5').toString()).toBe('750');
  });

  it('rejects more than two decimal places', () => {
    expect(() => toMinor('1.234')).toThrow();
    expect(() => toMinor('abc')).toThrow();
  });
});

describe('amountMinorSchema', () => {
  it('accepts integer strings', () => {
    expect(amountMinorSchema.safeParse('1234').success).toBe(true);
    expect(amountMinorSchema.safeParse('-50').success).toBe(true);
  });

  it('rejects float strings', () => {
    expect(amountMinorSchema.safeParse('12.34').success).toBe(false);
  });
});

describe('currencyCodeSchema', () => {
  it('accepts ISO-4217 codes', () => {
    expect(currencyCodeSchema.safeParse('USD').success).toBe(true);
    expect(currencyCodeSchema.safeParse('SAR').success).toBe(true);
  });

  it('rejects invalid codes', () => {
    expect(currencyCodeSchema.safeParse('usd').success).toBe(false);
    expect(currencyCodeSchema.safeParse('US').success).toBe(false);
  });
});