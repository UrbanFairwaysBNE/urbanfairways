import { test, expect } from 'bun:test';
import { shutdownOutcome } from './shutdown-report.ts';

test('legacy false with empty list is unknown, not failed closure or confirmed dead', () => {
  expect(shutdownOutcome({ success: false, stillRunning: [] })).toBe('unverified');
});
test('explicit successful verification is authoritative despite command failure', () => {
  expect(shutdownOutcome({ success: false, verificationSucceeded: true, stillRunning: [] })).toBe('clean');
});
test('verification errors remain unknown even with an empty list', () => {
  expect(shutdownOutcome({ success: true, verificationSucceeded: false, stillRunning: [] })).toBe('unverified');
});
test('remaining processes mean failed closure', () => {
  expect(shutdownOutcome({ success: true, stillRunning: [{ name: 'GSPro.exe', pid: 44 }] })).toBe('running');
});