import { CSV_HEADER, type ProductCsvRow } from '@omnisell/shared';

/**
 * Minimal RFC4180-ish CSV reader/writer for catalog import/export
 * (featureslist.md 3.10). Pure, dependency-free — the row shape is small and
 * flat enough that pulling in a CSV library would be disproportionate to
 * what's needed (prompt.md's "keep proportionate" guidance).
 */
export function productsToCsv(rows: ProductCsvRow[]): string {
  const lines = [CSV_HEADER.join(','), ...rows.map((row) => CSV_HEADER.map((key) => escapeCsvField(String(row[key] ?? ''))).join(','))];
  return lines.join('\n');
}

export function csvToProductRows(text: string): ProductCsvRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return [];
  }
  const header = rows[0] ?? [];
  return rows.slice(1).map((values) => {
    const row: Record<string, string> = {};
    header.forEach((key, index) => {
      row[key] = values[index] ?? '';
    });
    return row as unknown as ProductCsvRow;
  });
}

function escapeCsvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * A single pass over the whole text, quote-aware across embedded newlines —
 * splitting on `\n` BEFORE parsing (a naive but tempting first attempt) would
 * incorrectly cut a quoted multi-line field into two rows. Rows are only
 * terminated on an unquoted newline.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      currentRow.push(current);
      current = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      currentRow.push(current);
      current = '';
      if (currentRow.some((field) => field.length > 0) || currentRow.length > 1) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      current += char;
    }
  }
  if (current.length > 0 || currentRow.length > 0) {
    currentRow.push(current);
    rows.push(currentRow);
  }
  return rows;
}
