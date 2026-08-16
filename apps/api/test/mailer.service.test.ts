import { describe, expect, it } from 'vitest';
import { MailerService } from '../src/mailer/mailer.service';

describe('MailerService', () => {
  it('degrades gracefully when SMTP is unreachable instead of throwing', async () => {
    const mailer = new MailerService();
    await expect(
      mailer.send({ to: 'nobody@demo.test', subject: 'test', text: 'test' }),
    ).resolves.toBeUndefined();
  });
});
