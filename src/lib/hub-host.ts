/**
 * App ("hub") host/path detection.
 *
 * The app and the public marketing site share one codebase. Two shapes work:
 *   - a dedicated host starting with `hub.` (e.g. hub.myvenue.com.au)
 *   - a single domain, where the app lives at `/app` (legacy alias `/hub`)
 *
 * Host-independent escape hatch: append `?hub=1` to any URL — this sticks for
 * the session via localStorage (clear it again with `?hub=0`).
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

  if (hostname.startsWith("hub.")) return true;
  if (isAppPath(pathname)) {
    try {
      localStorage.setItem(HUB_MODE_KEY, "1");
    } catch {
      /* ignore */
    }
    return true;
  }

  const param = new URLSearchParams(search).get("hub");
  if (param === "1") {
    try {
      localStorage.setItem(HUB_MODE_KEY, "1");
    } catch {
      /* ignore */
    }
    return true;
  }
  if (param === "0") {
    try {
      localStorage.removeItem(HUB_MODE_KEY);
    } catch {
      /* ignore */
    }
    return false;
  }

  try {
    return localStorage.getItem(HUB_MODE_KEY) === "1";
  } catch {
    return false;
  }
};
