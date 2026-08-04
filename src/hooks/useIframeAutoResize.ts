import { useEffect } from "react";

/**
 * Posts the document's scrollHeight to the parent window whenever it changes.
 * The parent Shopify page listens for these messages and resizes the iframe,
 * eliminating the nested-scroll problem (especially bad on iOS Safari).
 *
 * Parent snippet (paste into the Shopify page that embeds the iframe):
 *
 *   <script>
 *     window.addEventListener('message', function (e) {
 *       if (!e.data || e.data.type !== 'app:embed-height') return;
 *       var iframes = document.querySelectorAll('iframe[src*="/embed"]'); // scope to your hub domain in production
 *       iframes.forEach(function (f) {
 *         try {
 *           if (f.contentWindow === e.source) {
 *             f.style.height = (e.data.height + 20) + 'px';
 *             f.scrolling = 'no';
 *           }
 *         } catch (_) {}
 *       });
 *     });
 *   </script>
 */
export function useIframeAutoResize(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    // Only run when embedded
    if (window.parent === window) return;

    let lastHeight = 0;
    const post = (force = false) => {
      const height = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0
      );
      if (height && (force || height !== lastHeight)) {
        lastHeight = height;
        window.parent.postMessage(
          { type: "app:embed-height", height },
          "*"
        );
      }
    };

    // Aggressive initial bursts, data loads async, fonts/images shift layout,
    // and we want the parent iframe sized BEFORE the user's first scroll attempt.
    post(true);
    const burstTimers: number[] = [];
    [50, 150, 300, 500, 800, 1200, 1800, 2500, 3500, 5000].forEach((t) => {
      burstTimers.push(window.setTimeout(() => post(true), t));
    });

    const ro = new ResizeObserver(() => post());
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);

    const interval = window.setInterval(post, 1000);
    window.addEventListener("load", () => post(true));
    // Re-post when images finish loading (common layout shift)
    const onImgLoad = () => post(true);
    document.addEventListener("load", onImgLoad, true);

    return () => {
      ro.disconnect();
      window.clearInterval(interval);
      burstTimers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("load", () => post(true));
      document.removeEventListener("load", onImgLoad, true);
    };

  }, [enabled]);
}
