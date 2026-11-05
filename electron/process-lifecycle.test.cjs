const { test, expect } = require('bun:test');
const { inventory, killInstance, transitions, createOperationGate, createJournal } = require('./process-lifecycle.cjs');
const fs = require('fs');
const os = require('os');
const path = require('path');
const one = { name: 'GSPro.exe', pid: 10, createdAt: '2026-11-05T08:00:00.0000000Z' };
const labs = { name: 'ProTee Labs.exe', pid: 11, createdAt: '2026-11-05T08:01:00.0000000Z' };

test('inventory captures both GSPro copies and ProTee with creation times', async () => {
  const rows = [one, { ...one, pid: 12 }, labs];
  const result = await inventory(async (_, args) => {
    const script = Buffer.from(args[3], 'base64').toString('utf16le');
    expect(script).toContain('CreationDate');
    expect(script).toContain('Protee labs.exe');
    return { stdout: JSON.stringify(rows) };
  });
  expect(result.processes).toEqual(rows);
});
test('failed or malformed inventory remains unknown, never an empty success', async () => {
  expect((await inventory(async () => { throw new Error('Access denied'); })).success).toBe(false);
  expect((await inventory(async () => ({ stdout: '[{"pid":10}]' }))).success).toBe(false);
});
test('PID-targeted tree kill rechecks creation time and records request, not confirmed exit', async () => {
  const result = await killInstance(async (_, args) => {
    const script = Buffer.from(args[3], 'base64').toString('utf16le');
    expect(script).toContain('/F /T /PID 10');
    expect(script).toContain(one.createdAt);
    expect(script).toContain('Process identity changed; PID not killed');
    return { stdout: 'SUCCESS' };
  }, one);
  expect(result.status).toBe('kill_requested');
});
test('PID kill preserves access-denied errors', async () => {
  expect((await killInstance(async () => { throw new Error('Access denied'); }, labs)).status).toBe('failed');
});
test('reused PID is a new instance, surviving PID is not falsely exited', () => {
  const replacement = { ...one, createdAt: '2026-11-05T09:00:00Z' };
  expect(transitions([one, labs], [one, replacement])).toEqual({ started: [replacement], exited: [labs] });
});
test('shared gate blocks a second launch or close while one operation is pending', async () => {
  const run = createOperationGate();
  let release;
  const first = run(() => new Promise(resolve => { release = resolve; }));
  expect((await run(async () => ({ success: true }))).busy).toBe(true);
  release({ success: true });
  await first;
  expect((await run(async () => ({ success: true }))).success).toBe(true);
});
test('journal retains unacknowledged events across restart and identifies interrupted exit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'controller-journal-'));
  try {
    const file = path.join(dir, 'journal.json');
    const first = createJournal(fs, file, 'test');
    const event = first.record('process_started', { process: one });
    const second = createJournal(fs, file, 'test');
    expect(second.pending().some(e => e.id === event.id)).toBe(true);
    expect(second.pending().at(-1).details.previousExit).toBe('unclean_or_interrupted');
    second.acknowledge([event.id]);
    expect(second.pending().some(e => e.id === event.id)).toBe(false);
    second.close();
    const third = createJournal(fs, file, 'test');
    expect(third.pending().at(-1).details.previousExit).toBe('clean');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('failed journal writes cannot acknowledge or publish non-durable events', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'controller-disk-'));
  try {
    let fail = false;
    const disk = { ...fs, writeFileSync: (...args) => { if (fail) throw new Error('Disk full'); return fs.writeFileSync(...args); } };
    const journal = createJournal(disk, path.join(dir, 'journal.json'), 'test');
    const initial = journal.pending();
    fail = true;
    expect(() => journal.record('process_started', { process: labs })).toThrow('Disk full');
    expect(journal.pending()).toEqual(initial);
    expect(() => journal.acknowledge(initial.map(e => e.id))).toThrow('Disk full');
    expect(journal.pending()).toEqual(initial);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});