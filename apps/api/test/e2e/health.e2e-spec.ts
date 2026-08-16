import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';

describe('health endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(new Logger('e2e', { timestamp: false }));
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves liveness on GET /v1/healthz', async () => {
    const res = await request(app.getHttpServer()).get('/v1/healthz').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('reports readiness structure on GET /v1/readyz (db may be down without docker)', async () => {
    const res = await request(app.getHttpServer()).get('/v1/readyz').expect(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body.checks).toHaveProperty('database');
    expect(['ok', 'down']).toContain(res.body.checks.database);
  });

  it('echoes X-Request-Id', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/healthz')
      .set('X-Request-Id', 'e2e-trace-1')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('e2e-trace-1');
  });
});