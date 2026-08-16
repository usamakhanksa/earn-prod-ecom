import { execSync } from 'node:child_process';

const baseUrl = process.env.API_URL ?? 'http://localhost:4000';
const url = `${baseUrl.replace(/\/$/, '')}/v1/openapi.json`;

try {
  execSync(`openapi-typescript "${url}" -o src/types.openapi.gen.ts`, { stdio: 'inherit' });
  console.log('Generated src/types.openapi.gen.ts');
} catch (error) {
  console.error(
    `Failed to regenerate the typed client. Is the API running and serving ${url}? (pnpm dev:api)`,
  );
  process.exit(1);
}