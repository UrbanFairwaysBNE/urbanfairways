const { randomUUID } = require('crypto');
const { runSimulatorPowerShell, SIMULATOR_EXECUTABLES } = require('./simulator-processes.cjs');

function instanceKey(process) {
  return `${process.pid}:${process.createdAt}`;
}

async function inventory(execFileAsync) {
  const names = SIMULATOR_EXECUTABLES.map(name => `'${name.replace(/'/g, "''")}'`).join(',');
  const script = `$ErrorActionPreference='Stop'; $names=@(${names}); $rows=@(Get-CimInstance Win32_Process | Where-Object { $names -contains $_.Name } | ForEach-Object { if (!$_.CreationDate) { throw 'Missing process creation time' }; [pscustomobject]@{ name=$_.Name; pid=[int]$_.ProcessId; parentPid=[int]$_.ParentProcessId; createdAt=$_.CreationDate.ToUniversalTime().ToString('o'); executablePath=$_.ExecutablePath } }); ConvertTo-Json -InputObject $rows -Compress`;
  try {
    const { stdout } = await runSimulatorPowerShell(execFileAsync, script, 10000);
    const rows = JSON.parse(stdout.trim());
    if (!Array.isArray(rows) || rows.some(p => !Number.isInteger(p.pid) || p.pid <= 0 || typeof p.name !== 'string' || !Number.isFinite(Date.parse(p.createdAt)))) {
      throw new Error('Invalid process inventory');
    }
    return { success: true, processes: rows, observedAt: new Date().toISOString() };
  } catch (error) {
    return { success: false, processes: [], observedAt: new Date().toISOString(), error: String(error.stderr || error.message || error) };
  }
}

// Revalidate creation time inside Windows immediately before targeting a PID.
// A recycled PID is never intentionally killed using an old observation.
async function killInstance(execFileAsync, process) {
  if (!Number.isInteger(process.pid) || process.pid <= 0 || !Number.isFinite(Date.parse(process.createdAt))) {
    throw new Error('Invalid process identity');
  }
  const name = process.name.replace(/'/g, "''");
  const createdAt = process.createdAt.replace(/'/g, "''");
  const script = `$ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter 'ProcessId=${process.pid}'; if (!$p) { Write-Output 'already_exited'; exit }; if ($p.Name -ine '${name}' -or $p.CreationDate.ToUniversalTime().ToString('o') -ne '${createdAt}') { throw 'Process identity changed; PID not killed' }; & taskkill.exe /F /T /PID ${process.pid} 2>&1 | Out-String | Write-Output; if ($LASTEXITCODE -ne 0) { throw ('taskkill exit '+$LASTEXITCODE) }`;
  try {
    const { stdout } = await runSimulatorPowerShell(execFileAsync, script, 10000);
    return { ...process, status: 'kill_requested', output: stdout.trim() };
  } catch (error) {
    return { ...process, status: 'failed', error: String(error.stderr || error.message || error) };
  }
}

function transitions(previous, current) {
  const before = new Map(previous.map(p => [instanceKey(p), p]));
  const after = new Map(current.map(p => [instanceKey(p), p]));
  return {
    started: current.filter(p => !before.has(instanceKey(p))),
    exited: previous.filter(p => !after.has(instanceKey(p))),
  };
}

// One shared main-process gate survives renderer reloads and covers every IPC path.
function createOperationGate() {
  let busy = false;
  return async function run(operation) {
    if (busy) return { success: false, error: 'Another simulator operation is in progress', busy: true };
    busy = true;
    try { return await operation(); } finally { busy = false; }
  };
}

function createJournal(fs, file, version) {
  let state;
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { state = { events: [], session: null }; }
  if (!Array.isArray(state.events)) state.events = [];
  const prior = state.session;
  const instanceId = randomUUID();
  const persist = (next = state) => {
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(next));
    fs.renameSync(temporary, file);
    state = next;
  };
  const record = (kind, details = {}, context = {}) => {
    const event = { id: randomUUID(), kind, observedAt: new Date().toISOString(), controllerInstanceId: instanceId, appVersion: version, ...context, details };
    const next = { ...state, events: [...state.events, event] };
    // Disk journal bounded at 10k lifecycle events, not noisy routine polls.
    if (next.events.length > 10000) {
      next.events.splice(0, next.events.length - 9999);
      next.events.push({ ...event, id: randomUUID(), kind: 'telemetry_gap', details: { reason: 'Journal capacity exceeded' } });
    }
    persist(next);
    return event;
  };
  state.session = { instanceId, startedAt: new Date().toISOString(), cleanExit: false };
  record('controller_started', { previousSession: prior, previousExit: prior ? (prior.cleanExit ? 'clean' : 'unclean_or_interrupted') : 'unknown' });
  return {
    instanceId, record,
    pending: () => state.events.slice(0, 100),
    acknowledge: ids => { const acknowledged = new Set(ids); persist({ ...state, events: state.events.filter(e => !acknowledged.has(e.id)) }); },
    close: () => { record('controller_stopping'); persist({ ...state, session: { ...state.session, cleanExit: true } }); },
  };
}

module.exports = { inventory, killInstance, instanceKey, transitions, createOperationGate, createJournal };