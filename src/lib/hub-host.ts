/**
 * Hub host detection.
 *
 * The Hub and the public marketing site share one codebase and are separated by
 * hostname: any host starting with `hub.` (e.g. hub.myvenue.com.au) serves the Hub.
 *
 * Because a Lovable `*.lovable.app` URL can never start with `hub.`, there are two
 * host-independent escape hatches for baseline/testing use:
 *   - visit `/hub` (a real route that renders the Hub login)
 *   - append `?hub=1` to any URL — this sticks for the session via localStorage
 *     (clear it again with `?hub=0`)
 */
const HUB_MODE_KEY = "hub_mode";

export const isHubHost = (): boolean => {
  if (typeof window === "undefined") return false;

  const { hostname, pathname, search } = window.location;

  if (hostname.startsWith("hub.")) return true;
  if (pathname === "/hub" || pathname.startsWith("/hub/")) return true;

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
