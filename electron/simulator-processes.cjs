const SIMULATOR_EXECUTABLES = [
  'GSPro.exe', 'GSProLauncher.exe', 'Protee labs.exe', 'ProteeLabs.exe',
  'ProTee United VX.exe', 'ProTeeUnitedVX.exe',
];

function isProteeLabsTitle(title) {
  if (typeof title !== 'string') return false;
  const normalized = title.trim().toLowerCase();
  return normalized === 'protee' ||
    (normalized.includes('protee') && normalized.includes('labs') && !normalized.includes('united vx'));
}

async function killSimulatorTrees(execFileAsync) {
  return Promise.all(SIMULATOR_EXECUTABLES.map(async (name) => {
    try {
      await execFileAsync('taskkill', ['/F', '/T', '/IM', name], { timeout: 5000 });
      return { app: name, status: 'closed' };
    } catch (error) {
      const message = String(error.stderr || error.message || 'Taskkill failed');
      // Exit 128 means the named process does not exist, not a permission failure.
      if (error.code === 128 && !/access.*denied/i.test(message)) {
        return { app: name, status: 'not_running' };
      }
      return { app: name, status: 'failed', error: message };
    }
  }));
}

// Do not send scripts through cmd.exe: quoted pipes can become shell operators.
// PowerShell's encoded command accepts UTF-16LE without shell quote parsing.
async function runSimulatorPowerShell(execFileAsync, script, timeout) {
  return execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(script, 'utf16le').toString('base64'),
  ], { timeout, windowsHide: true });
}

// One snapshot, then match names locally: multiple tasklist /FI filters are ANDed.
async function checkSimulatorProcesses(execFileAsync) {
  try {
    const { stdout } = await execFileAsync('tasklist', ['/FO', 'CSV', '/NH'], { timeout: 5000 });
    const names = new Set(SIMULATOR_EXECUTABLES.map(name => name.toLowerCase()));
    const processes = [];
    for (const line of stdout.split('\n')) {
      const match = line.trim().match(/^"([^"]+)","(\d+)"/);
      if (match && names.has(match[1].toLowerCase())) {
        processes.push({ name: match[1], pid: Number(match[2]) });
      }
    }
    // An empty/malformed command response is not evidence of a clean process list.
    if (!stdout.split('\n').some(line => /^"[^"]+","\d+"/.test(line.trim()))) {
      return { success: false, processes: [], error: 'Unrecognised tasklist response' };
    }
    return { success: true, processes };
  } catch (error) {
    return { success: false, processes: [], error: String(error.stderr || error.message || error) };
  }
}

// Only GSPro and ProTee matter for a session handover. Other windowed apps
// (NVIDIA Overlay, on-screen keyboard, browsers) are tidied up best-effort but
// must never fail a shutdown or block a changeover.
function isSimulatorProcess(name) {
  if (typeof name !== 'string') return false;
  const normalized = name.trim().toLowerCase().replace(/\.exe$/, '');
  return SIMULATOR_EXECUTABLES.some(exe => exe.toLowerCase().replace(/\.exe$/, '') === normalized);
}

function shutdownVerification(visible, named) {
  const processes = [...visible.processes.filter(p => isSimulatorProcess(p.name)), ...named.processes];
  const stillRunning = [...new Map(processes.map(process => [process.pid, process])).values()];
  const verificationSucceeded = visible.success && named.success;
  return {
    success: verificationSucceeded && stillRunning.length === 0,
    verificationSucceeded,
    stillRunning,
    verificationErrors: [visible.error, named.error].filter(Boolean),
  };
}

// GSPro and ProTee Labs are launched independently: a leftover or stuck Labs
// instance must never stop GSPro from opening for the next customer.
const GSPRO_EXECUTABLES = ['gspro.exe', 'gsprolauncher.exe'];
const LABS_EXECUTABLES = ['protee labs.exe', 'proteelabs.exe'];
const exeName = (name) => String(name || '').trim().toLowerCase().replace(/(\.exe)?$/, '.exe');

function runningSimulatorApps(processes) {
  const names = (processes || []).map(p => exeName(p && p.name));
  return {
    gspro: names.some(n => GSPRO_EXECUTABLES.includes(n)),
    labs: names.some(n => LABS_EXECUTABLES.includes(n)),
  };
}

function launchPlan(processes, labsConfigured) {
  const running = runningSimulatorApps(processes);
  const launchGspro = !running.gspro;
  const launchLabs = !!labsConfigured && !running.labs;
  return { running, launchGspro, launchLabs, nothingToLaunch: !launchGspro && !launchLabs };
}

// "Access is denied" means the target runs with higher (admin) rights than the
// controller, e.g. ProTee Labs relaunched by its own updater. Windows only lets
// us retry with admin rights silently when UAC is set to "Never notify"; we never
// trigger a UAC prompt in front of a customer.
function elevationPlan(state) {
  if (!state || state.error) return 'unknown';
  if (state.isElevated) return 'already_elevated';
  if (!state.isAdmin) return 'not_admin';
  if (state.consentPromptAdmin === 0) return 'silent';
  if (state.consentPromptAdmin === null || state.consentPromptAdmin === undefined) return 'unknown';
  return 'would_prompt';
}

async function readElevationState(execFileAsync) {
  const script = "$ErrorActionPreference='Stop'; $s=Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System'; $g=(whoami /groups) -join ' '; Write-Output ('UAC|' + $s.EnableLUA + '|' + $s.ConsentPromptBehaviorAdmin + '|' + ($g -match 'S-1-5-32-544') + '|' + ($g -match 'S-1-16-12288'))";
  try {
    const { stdout } = await runSimulatorPowerShell(execFileAsync, script, 10000);
    const line = String(stdout).split('\n').map(l => l.trim()).find(l => l.startsWith('UAC|'));
    if (!line) throw new Error('Unrecognised UAC response');
    const [, lua, consent, admin, elevated] = line.split('|');
    const num = (v) => (v === '' || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
    return { enableLua: num(lua), consentPromptAdmin: num(consent), isAdmin: admin === 'True', isElevated: elevated === 'True' };
  } catch (error) {
    return { error: String(error.stderr || error.message || error) };
  }
}

function deniedSimulatorNames(killResults) {
  const allowed = new Map(SIMULATOR_EXECUTABLES.map(n => [n.toLowerCase(), n]));
  const names = new Set();
  for (const r of killResults || []) {
    if (!r || r.status !== 'failed' || !/access.*denied/i.test(String(r.error || ''))) continue;
    const exe = allowed.get(exeName(r.app || r.name));
    if (exe) names.add(exe);
  }
  return [...names];
}

// One silent admin-level taskkill for the denied simulator executables only
// (fixed allow-list, so nothing else can ever be closed this way).
async function retryDeniedWithElevation(execFileAsync, killResults) {
  const names = deniedSimulatorNames(killResults);
  if (!names.length) return { attempted: false, names };
  const state = await readElevationState(execFileAsync);
  const plan = elevationPlan(state);
  if (plan !== 'silent') return { attempted: false, names, plan, state };
  const args = ['/F', '/T', ...names.flatMap(n => ['/IM', `"${n}"`])].join(' ');
  const script = `$ErrorActionPreference='Stop'; $p=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\\taskkill.exe') -ArgumentList '${args}' -Verb RunAs -WindowStyle Hidden -PassThru -Wait; Write-Output ('EXIT|' + $p.ExitCode)`;
  try {
    const { stdout } = await runSimulatorPowerShell(execFileAsync, script, 20000);
    const match = String(stdout).match(/EXIT\|(-?\d+)/);
    const exitCode = match ? Number(match[1]) : null;
    return { attempted: true, names, plan, exitCode, success: exitCode === 0 };
  } catch (error) {
    return { attempted: true, names, plan, success: false, error: String(error.stderr || error.message || error) };
  }
}

module.exports = { SIMULATOR_EXECUTABLES, isSimulatorProcess, isProteeLabsTitle, killSimulatorTrees, runSimulatorPowerShell, checkSimulatorProcesses, shutdownVerification, runningSimulatorApps, launchPlan, elevationPlan, readElevationState, deniedSimulatorNames, retryDeniedWithElevation };