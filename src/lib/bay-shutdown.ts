export const SIMULATOR_EXECUTABLES = ["GSPro.exe", "Protee labs.exe", "ProteeLabs.exe"];
export const MAX_SHUTDOWN_ATTEMPTS = 3;
export const SHUTDOWN_SETTLE_MS = 5000;

/** One bounded shutdown operation, with live booking checks before every attempt. */
export async function prepareBayPowerOff(options: {
  shouldKeepPower: () => boolean;
  checkApps: () => Promise<boolean>;
  closeApps: () => Promise<unknown>;
  wait: (milliseconds: number) => Promise<void>;
  log: (message: string) => void;
}): Promise<"cancelled" | "clean" | "forced"> {
  for (let attempt = 1; attempt <= MAX_SHUTDOWN_ATTEMPTS; attempt++) {
    if (options.shouldKeepPower()) return "cancelled";
    try {
      if (!(await options.checkApps())) return "clean";
    } catch {
      options.log(`Cannot verify simulator state; attempting shutdown (${attempt}/3)`);
    }
    if (options.shouldKeepPower()) return "cancelled";
    try {
      await options.closeApps();
    } catch {
      options.log(`Simulator shutdown failed (${attempt}/3); check Windows permissions`);
    }
    await options.wait(SHUTDOWN_SETTLE_MS);
    if (options.shouldKeepPower()) return "cancelled";
    try {
      if (!(await options.checkApps())) return "clean";
    } catch {
      options.log(`Simulator verification failed after attempt ${attempt}/3`);
    }
  }
  options.log("Shutdown limit reached after 3 attempts; switching bay plugs off despite unverified/running apps");
  return "forced";
}