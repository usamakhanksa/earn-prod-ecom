import { createApp } from './app.js';
import { env } from './env.js';

const app = createApp();

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.warn(
    `[marketplace-api] listening on http://localhost:${env.PORT} ` +
      `(MOCK_MODE=${env.MOCK_MODE}, database=${env.hasRealDatabase ? 'postgres' : 'in-memory mock'})`,
  );
});
