import { describe, expect, it } from 'vitest';
import type { ProductCsvRow } from '@omnisell/shared';
import { csvToProductRows, productsToCsv } from '../src/catalog/products/csv.util';

const SAMPLE_ROW: ProductCsvRow = {
  productSku: 'TEE-001',
  productName: 'Classic Tee',
  status: 'ACTIVE',
  variantSku: 'TEE-001-M-BLACK',
  size: 'M',
  color: 'Black',
  isEnabled: 'true',
  baseCostMinor: '1200',
  priceMinor: '2999',
  currency: 'USD',
};

describe('productsToCsv / csvToProductRows round trip', () => {
  it('round-trips a simple row exactly', () => {
    const csv = productsToCsv([SAMPLE_ROW]);
    const rows = csvToProductRows(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(SAMPLE_ROW);
  });

  it('writes a header row matching CSV_HEADER order', () => {
    const csv = productsToCsv([SAMPLE_ROW]);
    const [header] = csv.split('\n');
    expect(header).toBe('productSku,productName,status,variantSku,size,color,isEnabled,baseCostMinor,priceMinor,currency');
  });

  it('quotes and escapes fields containing commas, quotes, or newlines', () => {
    const row: ProductCsvRow = { ...SAMPLE_ROW, productName: 'Tee, "Classic"\nEdition' };
    const csv = productsToCsv([row]);
    const rows = csvToProductRows(csv);
    expect(rows[0]?.productName).toBe('Tee, "Classic"\nEdition');
  });

  it('handles multiple rows', () => {
    const rows = [SAMPLE_ROW, { ...SAMPLE_ROW, variantSku: 'TEE-001-L-BLACK', size: 'L' }];
    const csv = productsToCsv(rows);
    const parsed = csvToProductRows(csv);
    expect(parsed).toHaveLength(2);
    expect(parsed[1]?.size).toBe('L');
  });

  it('returns an empty array for empty input', () => {
    expect(csvToProductRows('')).toEqual([]);
    expect(productsToCsv([])).toBe(
      'productSku,productName,status,variantSku,size,color,isEnabled,baseCostMinor,priceMinor,currency',
    );
  });
});
