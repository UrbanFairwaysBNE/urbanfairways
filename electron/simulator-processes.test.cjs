const { test, expect } = require('bun:test');
const { isProteeLabsTitle, killSimulatorTrees } = require('./simulator-processes.cjs');

test('recognises ProTee window title without requiring Labs', () => {
  expect(isProteeLabsTitle('ProTee')).toBe(true);
  expect(isProteeLabsTitle('ProTee United VX')).toBe(false);
  expect(isProteeLabsTitle('Unrelated Labs')).toBe(false);
});

test('kills the confirmed simulator executable and its process tree', async () => {
  const calls = [];
  await killSimulatorTrees(async (file, args) => { calls.push({ file, args }); });
  expect(calls).toContainEqual({ file: 'taskkill', args: ['/F', '/T', '/IM', 'Protee labs.exe'] });
  expect(calls).toContainEqual({ file: 'taskkill', args: ['/F', '/T', '/IM', 'GSPro.exe'] });
});

test('records access denied rather than treating it as already closed', async () => {
  const results = await killSimulatorTrees(async () => {
    throw Object.assign(new Error('Access is denied'), { code: 1 });
  });
  expect(results.every(result => result.status === 'failed')).toBe(true);
});