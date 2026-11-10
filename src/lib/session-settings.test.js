import { describe, expect, test } from 'bun:test';
import { createSettingsPreparer, findSessionBooking, hasPrecedingBooking, settingsKey } from './session-settings';

const booking = (id, start, end, extra = {}) => ({ id, booking_date: '2026-11-10', start_time: start, end_time: end, status: 'confirmed', user_id: `u-${id}`, ...extra });
const at = (time) => new Date(`2026-11-10T${time}`);

describe('session settings preparation', () => {
  test('power-on preparation is reused by the launch one minute later, so files are written once', async () => {
    const prep = createSettingsPreparer();
    let writes = 0;
    const run = async () => { writes++; return { status: 'applied', files: ['Settings.vgs'] }; };
    const b = booking('a', '18:00:00', '19:00:00');
    await prep.prepare(settingsKey(b), run);   // T-3m power-on
    await prep.prepare(settingsKey(b), run);   // T-1m launch
    expect(writes).toBe(1);
  });

  test('a write refused because GSPro is open is retried by the launch', async () => {
    const prep = createSettingsPreparer();
    let writes = 0;
    const results = [{ status: 'skipped_running', files: [] }, { status: 'applied', files: ['Settings.vgs'] }];
    const run = async () => results[writes++];
    expect((await prep.prepare('a:u', run)).status).toBe('skipped_running');
    expect((await prep.prepare('a:u', run)).status).toBe('applied');
    expect(writes).toBe(2);
  });

  test('a different customer waits for the previous write to finish before writing', async () => {
    const prep = createSettingsPreparer();
    const order = [];
    let finishFirst;
    const first = prep.prepare('a:u1', () => new Promise(r => { order.push('a-start'); finishFirst = () => { order.push('a-end'); r({ status: 'applied', files: [] }); }; }));
    const second = prep.prepare('b:u2', async () => { order.push('b'); return { status: 'applied', files: [] }; });
    await Promise.resolve(); await Promise.resolve();
    finishFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(['a-start', 'a-end', 'b']);
    expect(prep.preparedKey).toBe('b:u2');
  });

  test('changing the booking customer re-prepares the files', () => {
    expect(settingsKey(booking('a', '18:00:00', '19:00:00'))).not.toBe(settingsKey(booking('a', '18:00:00', '19:00:00', { user_id: 'other' })));
  });

  test('a booking created during its own session is found without waiting for the active-booking state', () => {
    const list = [booking('late', '18:00:00', '19:30:00')];
    expect(findSessionBooking(list, at('18:16:30'), '2026-11-10', 3)?.id).toBe('late');
  });

  test('power-on window opens 3 minutes before the start, not earlier', () => {
    const list = [booking('a', '18:00:00', '19:00:00')];
    expect(findSessionBooking(list, at('17:56:59'), '2026-11-10', 3)).toBeNull();
    expect(findSessionBooking(list, at('17:57:00'), '2026-11-10', 3)?.id).toBe('a');
  });

  test('the running session wins over the next booking in its lead-in window', () => {
    const list = [booking('next', '19:00:00', '20:00:00'), booking('now', '18:00:00', '19:00:00')];
    expect(findSessionBooking(list, at('18:58:00'), '2026-11-10', 3)?.id).toBe('now');
    expect(findSessionBooking(list, at('19:00:00'), '2026-11-10', 3)?.id).toBe('next');
  });

  test('cancelled bookings and back-to-back follow-ons are left to their own flow', () => {
    const list = [booking('x', '18:00:00', '19:00:00', { status: 'cancelled' }), booking('b', '19:00:00', '20:00:00')];
    expect(findSessionBooking(list, at('18:30:00'), '2026-11-10', 3)).toBeNull();
    expect(hasPrecedingBooking(list, list[1])).toBe(false);
    expect(hasPrecedingBooking([booking('a', '18:00:00', '19:00:00'), list[1]], list[1])).toBe(true);
  });
});
