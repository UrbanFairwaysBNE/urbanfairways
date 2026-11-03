export interface ShutdownReport {
  success: boolean;
  verificationSucceeded?: boolean;
  stillRunning?: { name: string; pid: number }[];
}

// Legacy binaries omit verification status: false + [] is ambiguous, not proof of closure.
export function shutdownOutcome(result: ShutdownReport): 'clean' | 'running' | 'unverified' {
  if (result.stillRunning?.length) return 'running';
  if (result.verificationSucceeded === false) return 'unverified';
  if (Array.isArray(result.stillRunning) && (result.verificationSucceeded === true || result.success)) return 'clean';
  return 'unverified';
}