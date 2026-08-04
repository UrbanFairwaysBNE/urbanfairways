/**
 * App ("hub") host/path detection.
 *
 * The app and the public marketing site share one codebase. Two shapes work:
 *   - a dedicated host starting with `hub.` (e.g. hub.myvenue.com.au)
 *   - a single domain, where the app lives at `/app` (legacy alias `/hub`)
 *
 * Host-independent escape hatch: append `?hub=1` to any URL.
 *
 * Detection is stateless — visiting `/app` must never make the root domain
 * render the app afterwards.
 */
const HUB_MODE_KEY = "hub_mode";

const isAppPath = (pathname: string) =>
  pathname === "/app" ||
  pathname.startsWith("/app/") ||
  pathname === "/hub" ||
  pathname.startsWith("/hub/");

export const isHubHost = (): boolean => {
  if (typeof window === "undefined") return false;

  const { hostname, pathname, search } = window.location;

  // Clear any legacy sticky flag left over from previous versions.
  try {
    localStorage.removeItem(HUB_MODE_KEY);
  } catch {
    /* ignore */
  }

  if (hostname.startsWith("hub.")) return true;
  if (isAppPath(pathname)) return true;

  return new URLSearchParams(search).get("hub") === "1";
};
