/** Join an existing shutdown instead of sending a competing Windows request. */
export function createShutdownCoordinator<T>() {
  let pending: Promise<T> | null = null;
  return {
    get isClosing() { return pending !== null; },
    run(operation: () => Promise<T>): Promise<T> {
      if (pending) return pending;
      const request = Promise.resolve().then(operation);
      const joined = request.finally(() => {
        if (pending === joined) pending = null;
      });
      pending = joined;
      return joined;
    },
  };
}

/** Changeover owns settings and launch; ordinary automation must leave it alone. */
export function canRunRegularAutomation(state: {
  changeoverInProgress: boolean;
  launchInProgress: boolean;
  shutdownInProgress: boolean;
}) {
  return !state.changeoverInProgress && !state.launchInProgress && !state.shutdownInProgress;
}