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

function shutdownVerification(visible, named) {
  const processes = [...visible.processes, ...named.processes];
  const stillRunning = [...new Map(processes.map(process => [process.pid, process])).values()];
  const verificationSucceeded = visible.success && named.success;
  return {
    success: verificationSucceeded && stillRunning.length === 0,
    verificationSucceeded,
    stillRunning,
    verificationErrors: [visible.error, named.error].filter(Boolean),
  };
}

module.exports = { SIMULATOR_EXECUTABLES, isProteeLabsTitle, killSimulatorTrees, runSimulatorPowerShell, checkSimulatorProcesses, shutdownVerification };