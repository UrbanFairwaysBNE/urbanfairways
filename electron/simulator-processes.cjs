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

module.exports = { SIMULATOR_EXECUTABLES, isProteeLabsTitle, killSimulatorTrees };