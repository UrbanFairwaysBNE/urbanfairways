import { useEffect, useState } from "react";
import BrandLoader from "@/components/brand/BrandLoader";
import { installBusyTracker, subscribeBusy } from "@/lib/busy-tracker";

/** Delay before showing, so fast calls never flash the overlay. */
const SHOW_AFTER_MS = 450;

/**
 * Non-blocking busy indicator for the admin area. Appears whenever a backend
 * function call has been running for longer than SHOW_AFTER_MS, so staff can
 * see that a slower action (cancel membership, SGT sync, emails, refunds…)
 * is still working instead of pressing the button again.
 */
export const AdminBusyOverlay = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    installBusyTracker();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const unsubscribe = subscribeBusy((count) => {
      if (count > 0) {
        if (!timer) {
          timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
        }
      } else {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        setVisible(false);
      }
    });

    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 backdrop-blur-[2px] animate-fade-in"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-8 py-6 shadow-lg">
        <BrandLoader size={64} />
        <span className="text-sm text-muted-foreground">Working…</span>
      </div>
    </div>
  );
};

export default AdminBusyOverlay;
