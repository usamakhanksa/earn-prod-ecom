import { z } from 'zod';

export const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
export const AMOUNT_MINOR_PATTERN = /^-?\d+$/;

export const currencyCodeSchema = z
  .string()
  .regex(CURRENCY_CODE_PATTERN, 'Must be an ISO-4217 currency code')
  .brand<'CurrencyCode'>('CurrencyCode');
export type CurrencyCode = z.infer<typeof currencyCodeSchema>;

/**
 * Money stored as integer minor units (BIGINT semantics). Serialized as a string to stay
 * lossless across JSON boundaries. Rule: never floats, never doubles as points.
 */
export const amountMinorSchema = z
  .string()
  .regex(AMOUNT_MINOR_PATTERN, 'Minor-unit integer required')
  .brand<'AmountMinor'>('AmountMinor');
export type AmountMinor = z.infer<typeof amountMinorSchema>;

export interface MoneyDTO {
  amountMinor: AmountMinor;
  currency: CurrencyCode;
}

export const moneyDTOSchema = z.object({
  amountMinor: amountMinorSchema,
  currency: currencyCodeSchema,
});

const DECIMAL_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parse a decimal amount into integer minor units. Rejects more than two decimal places.
 * e.g. toMinor("12.34") -> 1234n.
 */
export function toMinor(value: string): bigint {
  const match = DECIMAL_PATTERN.exec(value);
  if (match === null) {
    throw new Error(`Invalid decimal amount: "${value}"`);
  }
  const whole = BigInt(match[1] ?? '0');
  const cents = match[2] === undefined ? 0n : BigInt(match[2]!.padEnd(2, '0'));
  return whole * 100n + cents;
}

export function minorToString(minor: bigint): string {
  return minor.toString();
}

/** True when the wallet/ledger invariant "money is integers" holds for the value. */
export function isMinorInteger(value: bigint): boolean {
  return value >= 0n || value < 0n;
}