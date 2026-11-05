import { test, expect } from 'bun:test';
import { controllerPresence } from './controller-presence';
test('recent existing heartbeat confirms online without extra controller pings', () => {
  const seen = '2026-11-05T09:13:00Z';
  expect(controllerPresence(seen, Date.parse('2026-11-05T09:15:00Z'))).toBe('online');
  expect(controllerPresence(seen, Date.parse('2026-11-05T09:15:01Z'))).toBe('unconfirmed');
});
test('missing, invalid or future observations do not establish online status', () => {
  expect(controllerPresence(null, 0)).toBe('unconfirmed');
  expect(controllerPresence('bad', 0)).toBe('unconfirmed');
  expect(controllerPresence('2026-11-05T09:13:00Z', 0)).toBe('unconfirmed');
});