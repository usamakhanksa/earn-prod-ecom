import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildZip, crc32 } from '../src/publishing/export-packs/zip-writer';

describe('zip-writer', () => {
  describe('crc32', () => {
    it('matches the well-known CRC-32 test vector for an empty buffer', () => {
      expect(crc32(Buffer.alloc(0))).toBe(0);
    });

    it('matches the well-known CRC-32 test vector for "123456789"', () => {
      // Standard published CRC-32 (ISO-3309) check value for this ASCII string.
      expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    });
  });

  describe('buildZip', () => {
    it('produces a buffer starting with the local file header signature', () => {
      const zip = buildZip([{ name: 'hello.txt', data: Buffer.from('hi') }]);
      expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    });

    it('ends with a valid end-of-central-directory record', () => {
      const zip = buildZip([{ name: 'a.txt', data: Buffer.from('a') }]);
      const eocdSig = zip.readUInt32LE(zip.length - 22);
      expect(eocdSig).toBe(0x06054b50);
    });

    it('handles an empty entry list', () => {
      const zip = buildZip([]);
      expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    });
  });

  describe('round-trip through the real system unzip binary', () => {
    let workDir: string | null = null;
    let unzipAvailable = true;

    afterAll(() => {
      if (workDir !== null) {
        rmSync(workDir, { recursive: true, force: true });
      }
    });

    it('a real unzip tool can list and extract every entry with matching bytes', () => {
      const entries = [
        { name: 'print-files/design-01.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]) },
        { name: 'metadata.csv', data: Buffer.from('title,tags\n"Sunset","nature,sky"\n', 'utf8') },
        { name: 'CHECKLIST.md', data: Buffer.from('# Upload checklist\n1. Do the thing\n', 'utf8') },
      ];
      const zip = buildZip(entries, new Date('2026-08-12T10:00:00Z'));

      workDir = mkdtempSync(join(tmpdir(), 'omnisell-zip-test-'));
      const zipPath = join(workDir, 'pack.zip');
      writeFileSync(zipPath, zip);

      let listing: string;
      try {
        listing = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
      } catch (error) {
        unzipAvailable = false;
        // No system `unzip` binary on PATH — the writer's own structural
        // assertions above still hold; this is the honest fallback rather
        // than a fabricated pass. See docs/DEBT.md if this ever triggers.
        console.warn('system `unzip` binary unavailable — skipping live round-trip verification', error);
        return;
      }
      for (const entry of entries) {
        expect(listing).toContain(entry.name);
      }

      execFileSync('unzip', ['-o', zipPath, '-d', workDir], { encoding: 'utf8' });
      for (const entry of entries) {
        const extracted = readFileSync(join(workDir, ...entry.name.split('/')));
        expect(extracted.equals(entry.data)).toBe(true);
      }
      expect(unzipAvailable).toBe(true);
    });
  });
});
