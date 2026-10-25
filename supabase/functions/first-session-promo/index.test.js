import { test, expect } from 'bun:test';

globalThis.Deno = { serve: () => {} };
const { handleRequest } = await import('./index.ts');

test('First Session Free stays disabled even when forced and issues zero credits', async () => {
  const response = handleRequest(new Request('https://example.test', {
    method: 'POST', body: JSON.stringify({ force: true, threshold: 1 }),
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, disabled: true, processed: 0 });
});

test('ordinary scheduled invocation also issues zero promotional credits', async () => {
  const response = handleRequest(new Request('https://example.test', { method: 'POST' }));
  expect(await response.json()).toEqual({ success: true, disabled: true, processed: 0 });
});