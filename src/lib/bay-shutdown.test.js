import { describe, expect, test } from "bun:test";
import { prepareBayPowerOff, SIMULATOR_EXECUTABLES } from "./bay-shutdown";

function scenario(overrides = {}) {
  const calls = { kills: 0, waits: [] };
  const options = {
    shouldKeepPower: () => false,
    checkApps: async () => true,
    closeApps: async () => { calls.kills++; },
    wait: async (ms) => { calls.waits.push(ms); },
    log: () => {},
    ...overrides,
  };
  return { calls, options };
}

describe("bay shutdown", () => {
  test("targets the confirmed Protee labs.exe executable", () => {
    expect(SIMULATOR_EXECUTABLES).toContain("Protee labs.exe");
    expect(SIMULATOR_EXECUTABLES).toContain("GSPro.exe");
  });
  test("caps persistent running apps at three kills with five-second settling", async () => {
    const { calls, options } = scenario();
    expect(await prepareBayPowerOff(options)).toBe("forced");
    expect(calls.kills).toBe(3);
    expect(calls.waits).toEqual([5000, 5000, 5000]);
  });
  test("verification errors cannot leave the power blocked indefinitely", async () => {
    const { calls, options } = scenario({ checkApps: async () => { throw new Error("IPC failed"); } });
    expect(await prepareBayPowerOff(options)).toBe("forced");
    expect(calls.kills).toBe(3);
  });
  test("stops immediately once simulators are closed", async () => {
    let checks = 0;
    const { calls, options } = scenario({ checkApps: async () => ++checks === 1 });
    expect(await prepareBayPowerOff(options)).toBe("clean");
    expect(calls.kills).toBe(1);
  });
  test("back-to-back or extended bookings cancel shutdown before killing", async () => {
    const { calls, options } = scenario({ shouldKeepPower: () => true });
    expect(await prepareBayPowerOff(options)).toBe("cancelled");
    expect(calls.kills).toBe(0);
  });
  test("a booking arriving during settling cancels power-off", async () => {
    let keepPower = false;
    const { calls, options } = scenario({
      shouldKeepPower: () => keepPower,
      wait: async () => { keepPower = true; },
    });
    expect(await prepareBayPowerOff(options)).toBe("cancelled");
    expect(calls.kills).toBe(1);
  });
});