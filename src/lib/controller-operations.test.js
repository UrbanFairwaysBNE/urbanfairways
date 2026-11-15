import { describe, expect, test } from 'bun:test';
import { createShutdownCoordinator, canRunRegularAutomation } from './controller-operations';
import { shutdownOutcome } from './shutdown-report';

describe('controller operation ownership', () => {
  test('overlapping shutdown callers await one verified result and issue only one kill request', async () => {
    const coordinator = createShutdownCoordinator();
    let finish;
    let kills = 0;
    const result = { success: true, verificationSucceeded: true, stillRunning: [] };
    const kill = () => { kills++; return new Promise(resolve => { finish = resolve; }); };
    const precision = coordinator.run(kill);
    const fallback = coordinator.run(kill);
    const powerOff = coordinator.run(kill);
    await Promise.resolve();
    expect(kills).toBe(1);
    expect(coordinator.isClosing).toBe(true);
    finish(result);
    expect(await Promise.all([precision, fallback, powerOff])).toEqual([result, result, result]);
    expect(coordinator.isClosing).toBe(false);
  });
  test('back-to-back changeover blocks the usual launch even after outgoing apps close', () => {
    expect(canRunRegularAutomation({ changeoverInProgress: true, launchInProgress: false, shutdownInProgress: false })).toBe(false);
    expect(canRunRegularAutomation({ changeoverInProgress: false, launchInProgress: false, shutdownInProgress: false })).toBe(true);
  });
  test('ordinary launch and fallback shutdown wait for an existing operation', () => {
    expect(canRunRegularAutomation({ changeoverInProgress: false, launchInProgress: true, shutdownInProgress: false })).toBe(false);
    expect(canRunRegularAutomation({ changeoverInProgress: false, launchInProgress: false, shutdownInProgress: true })).toBe(false);
  });
  test('coalescing preserves confirmed survivors and unavailable verification as failures', async () => {
    const coordinator = createShutdownCoordinator();
    const running = { success: false, verificationSucceeded: true, stillRunning: [{ name: 'Protee labs.exe', pid: 55 }] };
    expect(shutdownOutcome(await coordinator.run(async () => running))).toBe('running');
    expect(shutdownOutcome(await coordinator.run(async () => ({ success: false, verificationSucceeded: false, stillRunning: [] })))).toBe('unverified');
  });
  test('a rejected shutdown releases ownership so a later request can retry', async () => {
    const coordinator = createShutdownCoordinator();
    await expect(coordinator.run(async () => { throw new Error('Windows lookup failed'); })).rejects.toThrow('Windows lookup failed');
    expect(coordinator.isClosing).toBe(false);
    expect(await coordinator.run(async () => 'retry')).toBe('retry');
  });
});
import { simulatorAppsRunning, gsproRecoveryDecision, GSPRO_RECOVERY } from './controller-operations';

describe('GSPro recovery independent of ProTee Labs', () => {
  const start = Date.parse('2026-11-15T10:00:00+10:00');
  const end = start + 60 * 60000;
  const base = { startMs: start, endMs: end, misses: 0, attempts: 0, lastAttemptAt: 0 };
  const mid = start + 10 * 60000;

  test('a running ProTee Labs does not count as GSPro running', () => {
    expect(simulatorAppsRunning([{ name: 'Protee labs.exe' }])).toEqual({ gspro: false, labs: true });
  });

  test('relaunches GSPro after two consecutive missing checks mid-session', () => {
    const first = gsproRecoveryDecision({ ...base, nowMs: mid, gsproRunning: false });
    expect(first.action).toBe('wait');
    expect(gsproRecoveryDecision({ ...base, misses: first.misses, nowMs: mid + 15000, gsproRunning: false }).action).toBe('launch');
  });

  test('leaves the normal launch alone in the first 90 seconds and never reopens in the last 3 minutes', () => {
    expect(gsproRecoveryDecision({ ...base, misses: 5, nowMs: start + 60000, gsproRunning: false }).action).toBe('wait');
    expect(gsproRecoveryDecision({ ...base, misses: 5, nowMs: end - 120000, gsproRunning: false }).action).toBe('wait');
  });

  test('stops after 3 attempts per booking, 2 minutes apart', () => {
    expect(gsproRecoveryDecision({ ...base, misses: 1, attempts: 1, lastAttemptAt: mid - 60000, nowMs: mid, gsproRunning: false }).action).toBe('wait');
    expect(gsproRecoveryDecision({ ...base, misses: 1, attempts: GSPRO_RECOVERY.maxAttempts, nowMs: mid, gsproRunning: false }).action).toBe('exhausted');
  });
});
