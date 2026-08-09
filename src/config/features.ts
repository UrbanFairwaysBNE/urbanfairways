// Build-level feature flags.
// Turning a flag off hides all UI for that feature but leaves the underlying
// code, database structures and edge functions intact so it can be re-enabled
// by flipping the flag back to `true`.

/**
 * Session recording / highlight clips (OBS + Cloudflare Stream).
 * Disabled for this venue: the Bay Controller still fires its OBS commands,
 * they simply go nowhere and nothing is surfaced in the app.
 */
export const HIGHLIGHTS_ENABLED = false;
