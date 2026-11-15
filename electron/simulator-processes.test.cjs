const { test, expect } = require('bun:test');
const { isProteeLabsTitle, killSimulatorTrees, runSimulatorPowerShell, checkSimulatorProcesses, shutdownVerification } = require('./simulator-processes.cjs');

test('shutdown verification passes quoted pipes intact without a Windows command shell', async () => {
  const script = 'Get-Process | ForEach-Object { Write-Output ($_.ProcessName + "|" + $_.Id) }';
  const result = await runSimulatorPowerShell(async (file, args, options) => {
    expect(file).toBe('powershell.exe');
    expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand']);
    expect(Buffer.from(args[3], 'base64').toString('utf16le')).toBe(script);
    expect(options).toEqual({ timeout: 10000, windowsHide: true });
    expect(options.shell).toBeUndefined();
    return { stdout: '' };
  }, script, 10000);
  expect(result.stdout).toBe('');
});

test('encoded shutdown verification keeps Windows errors as failures', async () => {
  await expect(runSimulatorPowerShell(async () => {
    throw new Error('PowerShell timed out');
  }, 'Get-Process', 10000)).rejects.toThrow('PowerShell timed out');
});

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

test('a failed kill command does not override independent confirmed shutdown', async () => {
  const killed = await killSimulatorTrees(async () => { throw new Error('Process exited during kill'); });
  expect(killed[0].status).toBe('failed');
  expect(shutdownVerification({ success: true, processes: [] }, { success: true, processes: [] }).success).toBe(true);
});

test('empty process lists with failed verification are never clean', () => {
  const result = shutdownVerification({ success: true, processes: [] }, { success: false, processes: [], error: 'Access denied' });
  expect(result.success).toBe(false);
  expect(result.verificationSucceeded).toBe(false);
  expect(result.verificationErrors).toEqual(['Access denied']);
});

test('windowless simulator prevents clean shutdown', () => {
  expect(shutdownVerification({ success: true, processes: [] }, { success: true, processes: [{ name: 'GSPro.exe', pid: 44 }] }).success).toBe(false);
});

test('process snapshot finds both simulator names without contradictory filters', async () => {
  const result = await checkSimulatorProcesses(async (file, args) => {
    expect(file).toBe('tasklist');
    expect(args).toEqual(['/FO', 'CSV', '/NH']);
    return { stdout: '"GSPro.exe","44","Console","1","100 K"\n"Protee labs.exe","45","Console","1","100 K"\n"explorer.exe","46","Console","1","100 K"' };
  });
  expect(result.processes.map(p => p.pid)).toEqual([44, 45]);
});

test('tasklist errors and malformed output are not an empty verified list', async () => {
  expect((await checkSimulatorProcesses(async () => { throw new Error('Timeout'); })).success).toBe(false);
  expect((await checkSimulatorProcesses(async () => ({ stdout: '' }))).success).toBe(false);
});
test('non-simulator windows like NVIDIA Overlay never fail a shutdown', () => {
  const result = shutdownVerification(
    { success: true, processes: [{ name: 'NVIDIA Overlay', pid: 19960 }, { name: 'TabTip', pid: 12 }, { name: 'chrome', pid: 13 }] },
    { success: true, processes: [] },
  );
  expect(result.success).toBe(true);
  expect(result.stillRunning).toEqual([]);
});

test('a visible GSPro or ProTee Labs window still fails a shutdown', () => {
  expect(shutdownVerification({ success: true, processes: [{ name: 'GSPro', pid: 44 }] }, { success: true, processes: [] }).success).toBe(false);
  expect(shutdownVerification({ success: true, processes: [{ name: 'ProTee Labs', pid: 45 }] }, { success: true, processes: [] }).success).toBe(false);
});

const { launchPlan, elevationPlan, deniedSimulatorNames, retryDeniedWithElevation } = require('./simulator-processes.cjs');

test('a leftover ProTee Labs never stops GSPro launching', () => {
  const plan = launchPlan([{ name: 'Protee labs.exe', pid: 4176 }], true);
  expect(plan.launchGspro).toBe(true);
  expect(plan.launchLabs).toBe(false);
  expect(plan.nothingToLaunch).toBe(false);
});

test('GSPro already open launches only ProTee Labs', () => {
  const plan = launchPlan([{ name: 'GSPro.exe', pid: 10 }], true);
  expect(plan.launchGspro).toBe(false);
  expect(plan.launchLabs).toBe(true);
});

test('both apps open means nothing to launch', () => {
  expect(launchPlan([{ name: 'GSPro.exe', pid: 1 }, { name: 'ProteeLabs.exe', pid: 2 }], true).nothingToLaunch).toBe(true);
});

test('admin retry is silent only when UAC is set to never notify', () => {
  expect(elevationPlan({ isAdmin: true, isElevated: false, consentPromptAdmin: 0 })).toBe('silent');
  expect(elevationPlan({ isAdmin: true, isElevated: false, consentPromptAdmin: 5 })).toBe('would_prompt');
  expect(elevationPlan({ isAdmin: false, isElevated: false, consentPromptAdmin: 0 })).toBe('not_admin');
  expect(elevationPlan({ error: 'reg failed' })).toBe('unknown');
});

test('only access-denied simulator executables are retried with admin rights', () => {
  expect(deniedSimulatorNames([
    { app: 'Protee labs.exe', status: 'failed', error: 'ERROR: Access is denied.' },
    { app: 'GSPro.exe', status: 'not_running' },
    { app: 'notepad.exe', status: 'failed', error: 'Access is denied' },
  ])).toEqual(['Protee labs.exe']);
});

test('never shows a UAC prompt: no admin retry when Windows would ask', async () => {
  const calls = [];
  const result = await retryDeniedWithElevation(async (file, args) => {
    calls.push(Buffer.from(args[3], 'base64').toString('utf16le'));
    return { stdout: 'UAC|1|5|True|False' };
  }, [{ app: 'Protee labs.exe', status: 'failed', error: 'Access is denied' }]);
  expect(result.attempted).toBe(false);
  expect(result.plan).toBe('would_prompt');
  expect(calls.some(script => script.includes('RunAs'))).toBe(false);
});

test('silent admin retry targets only the denied simulator', async () => {
  const scripts = [];
  const result = await retryDeniedWithElevation(async (file, args) => {
    const script = Buffer.from(args[3], 'base64').toString('utf16le');
    scripts.push(script);
    return { stdout: script.includes('RunAs') ? 'EXIT|0' : 'UAC|1|0|True|False' };
  }, [{ app: 'Protee labs.exe', status: 'failed', error: 'Access is denied' }]);
  expect(result.success).toBe(true);
  const kill = scripts.find(script => script.includes('RunAs'));
  expect(kill).toContain('/IM "Protee labs.exe"');
  expect(kill).not.toContain('GSPro.exe');
});
