/** Join an existing shutdown instead of sending a competing Windows request. */
export function createShutdownCoordinator<T>() {
  let pending: Promise<T> | null = null;
  return {
    get isClosing() { return pending !== null; },
    run(operation: () => Promise<T>): Promise<T> {
      if (pending) return pending;
      const request = Promise.resolve().then(operation);
      const joined = request.finally(() => {
        if (pending === joined) pending = null;
      });
      pending = joined;
      return joined;
    },
  };
}

/** Changeover owns settings and launch; ordinary automation must leave it alone. */
export function canRunRegularAutomation(state: {
  changeoverInProgress: boolean;
  launchInProgress: boolean;
  shutdownInProgress: boolean;
}) {
  return !state.changeoverInProgress && !state.launchInProgress && !state.shutdownInProgress;
}

const GSPRO_EXES = ['gspro.exe', 'gsprolauncher.exe'];
const LABS_EXES = ['protee labs.exe', 'proteelabs.exe'];
const exe = (name: string) => name.trim().toLowerCase().replace(/(\.exe)?$/, '.exe');

/** Which simulator apps a process list shows, judged separately for each app. */
export function simulatorAppsRunning(processes: { name: string }[]) {
  const names = processes.map(p => exe(p.name ?? ''));
  return {
    gspro: names.some(n => GSPRO_EXES.includes(n)),
    labs: names.some(n => LABS_EXES.includes(n)),
  };
}

/** Mid-session GSPro recovery limits: bounded so a bad install can never loop. */
export const GSPRO_RECOVERY = {
  pollMs: 15_000,
  startGraceMs: 90_000,   // leave the normal T-1m launch sequence to finish
  endMarginMs: 180_000,   // never reopen just before the T-20s close
  missesRequired: 2,      // two checks in a row (~30s) before acting
  maxAttempts: 3,
  retryGapMs: 120_000,
};

export type GsproRecoveryState = { misses: number; attempts: number; lastAttemptAt: number };

/**
 * GSPro is missing during a live session (e.g. a leftover ProTee Labs kept the
 * controller thinking "apps running"): relaunch GSPro on its own, a bounded
 * number of times per booking.
 */
export function gsproRecoveryDecision(input: GsproRecoveryState & {
  nowMs: number; startMs: number; endMs: number; gsproRunning: boolean;
}): { action: 'reset' | 'wait' | 'launch' | 'exhausted'; misses: number } {
  const c = GSPRO_RECOVERY;
  if (input.gsproRunning) return { action: 'reset', misses: 0 };
  if (input.nowMs < input.startMs + c.startGraceMs || input.nowMs > input.endMs - c.endMarginMs) {
    return { action: 'wait', misses: 0 };
  }
  const misses = input.misses + 1;
  if (misses < c.missesRequired) return { action: 'wait', misses };
  if (input.attempts >= c.maxAttempts) return { action: 'exhausted', misses };
  if (input.lastAttemptAt && input.nowMs - input.lastAttemptAt < c.retryGapMs) return { action: 'wait', misses };
  return { action: 'launch', misses };
}
