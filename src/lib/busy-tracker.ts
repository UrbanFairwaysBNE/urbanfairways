import { supabase } from "@/integrations/supabase/client";

/**
 * Global in-flight tracker for backend function calls.
 *
 * `supabase.functions.invoke` is patched once so that ANY edge-function call
 * anywhere in the app increments a counter. UI can subscribe to show a busy
 * indicator without every button needing its own loading state.
 */

let inFlight = 0;
const listeners = new Set<(count: number) => void>();

const emit = () => {
  listeners.forEach((l) => l(inFlight));
};

export const subscribeBusy = (listener: (count: number) => void) => {
  listeners.add(listener);
  listener(inFlight);
  return () => {
    listeners.delete(listener);
  };
};

export const getBusyCount = () => inFlight;

/** Manually wrap any slow promise (long DB mutations, uploads, etc.). */
export async function trackBusy<T>(promise: Promise<T>): Promise<T> {
  inFlight += 1;
  emit();
  try {
    return await promise;
  } finally {
    inFlight = Math.max(0, inFlight - 1);
    emit();
  }
}

let patched = false;

export function installBusyTracker() {
  if (patched) return;
  patched = true;

  const functions = supabase.functions as unknown as {
    invoke: (...args: unknown[]) => Promise<unknown>;
  };
  const original = functions.invoke.bind(supabase.functions);

  functions.invoke = ((...args: unknown[]) => trackBusy(original(...args))) as typeof functions.invoke;
}
