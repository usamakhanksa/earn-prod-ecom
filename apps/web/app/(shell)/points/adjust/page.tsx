'use client';

import { useCallback, useState, useEffect } from 'react';
import { createTranslator, type Locale } from '@omnisell/i18n';
import { ApiRequestError } from '@omnisell/api-client';
import { POINT_ADJUST_REASON_CODES } from '@omnisell/shared';
import { Button } from '@omnisell/ui';
import { useSession } from '@/lib/session-context';

function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    const match = document.cookie.split('; ').find((row) => row.startsWith('omnisell-locale='));
    setLocale(match?.slice('omnisell-locale='.length) === 'ar' ? 'ar' : 'en');
  }, []);
  return locale;
}

/** Manual point adjustment tool (docs/points-extension.md §3.1/§10.3, task
 * 4.5.8) — always a NEW `ADJUST` row, mandatory reason code + note, never
 * mutates a validated row. */
export default function PointsAdjustPage(): React.JSX.Element {
  const locale = useLocale();
  const { t } = createTranslator(locale);
  const { client } = useSession();

  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState(100);
  const [sign, setSign] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [reasonCode, setReasonCode] = useState<string>(POINT_ADJUST_REASON_CODES[0]);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ transactionId: string; balanceAfter: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    setError(null);
    setResult(null);
    if (note.trim() === '') {
      setError(t('admin.points.adjust.note'));
      return;
    }
    setBusy(true);
    try {
      setResult(await client.post('/points/adjust', { userId, amount, sign, reasonCode, note }));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }, [client, userId, amount, sign, reasonCode, note, t]);

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-2xl font-bold text-text-primary">{t('admin.points.adjust.title')}</h1>

      <div className="space-y-3 rounded-lg bg-surface-1 p-4">
        <label className="block text-sm">
          {t('admin.points.adjust.user')}
          <input className="mt-1 w-full rounded border border-border-subtle p-2" value={userId} onChange={(e) => setUserId(e.target.value)} />
        </label>
        <label className="block text-sm">
          {t('admin.points.adjust.amount')}
          <input
            type="number"
            className="mt-1 w-full rounded border border-border-subtle p-2"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </label>
        <fieldset className="text-sm">
          <legend>{t('admin.points.adjust.direction')}</legend>
          <label className="mr-4">
            <input type="radio" checked={sign === 'CREDIT'} onChange={() => setSign('CREDIT')} /> {t('admin.points.adjust.credit')}
          </label>
          <label>
            <input type="radio" checked={sign === 'DEBIT'} onChange={() => setSign('DEBIT')} /> {t('admin.points.adjust.debit')}
          </label>
        </fieldset>
        <label className="block text-sm">
          {t('admin.points.adjust.reasonCode')}
          <select className="mt-1 w-full rounded border border-border-subtle p-2" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
            {POINT_ADJUST_REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          {t('admin.points.adjust.note')}
          <textarea className="mt-1 w-full rounded border border-border-subtle p-2" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <Button disabled={busy || userId === ''} onClick={() => void submit()}>
          {t('admin.points.adjust.submit')}
        </Button>
        {error !== null && <p className="text-sm text-danger">{error}</p>}
        {result !== null && (
          <p className="text-sm text-success">
            OK — balance after: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{result.balanceAfter}</span>
          </p>
        )}
      </div>
    </div>
  );
}
