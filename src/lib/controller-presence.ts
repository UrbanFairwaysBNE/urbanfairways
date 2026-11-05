/** Heartbeats already arrive every 30s; missing traffic means unknown, not proven PC shutdown. */
export function controllerPresence(lastSeen: string | null, now: number): 'online' | 'unconfirmed' {
  const seen = lastSeen ? Date.parse(lastSeen) : NaN;
  return Number.isFinite(seen) && now >= seen && now - seen <= 120000 ? 'online' : 'unconfirmed';
}