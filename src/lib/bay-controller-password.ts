/**
 * Bay Controller access password.
 *
 * The default password ships with the build. Once an operator changes it from
 * Settings, a SHA-256 hash of the new password is stored locally on that bay PC
 * and takes precedence over the default.
 */

const STORAGE_KEY = "bayController_passwordHash";
export const DEFAULT_CONTROLLER_PASSWORD = "Holeinone1";

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** True when the operator has set a custom password on this PC. */
export function hasCustomControllerPassword(): boolean {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

/** Verify an entered password against the custom hash, or the shipped default. */
export async function verifyControllerPassword(input: string): Promise<boolean> {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  if (!stored) return input === DEFAULT_CONTROLLER_PASSWORD;
  return (await sha256(input)) === stored;
}

/** Store a new password on this PC. */
export async function setControllerPassword(next: string): Promise<void> {
  localStorage.setItem(STORAGE_KEY, await sha256(next));
}

/** Clear the custom password, reverting to the shipped default. */
export function resetControllerPassword(): void {
  localStorage.removeItem(STORAGE_KEY);
}
