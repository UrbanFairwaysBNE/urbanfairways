/**
 * TTLock Open Platform client. One developer app (client id/secret) is shared
 * across venues; each venue authorises with its OWN TTLock account.
 */
import nodeCrypto from "node:crypto";

const API = "https://euapi.ttlock.com";

export function getTTLockCredentials() {
  const clientId = Deno.env.get("TTLOCK_CLIENT_ID");
  const clientSecret = Deno.env.get("TTLOCK_CLIENT_SECRET");
  const username = Deno.env.get("TTLOCK_USERNAME");
  const password = Deno.env.get("TTLOCK_PASSWORD");
  if (!clientId || !clientSecret || !username || !password) return null;
  return { clientId, clientSecret, username, password };
}

export class TTLockClient {
  private token: string | null = null;
  constructor(private cfg: NonNullable<ReturnType<typeof getTTLockCredentials>>) {}

  async authenticate(): Promise<void> {
    const body = new URLSearchParams({
      clientId: this.cfg.clientId,
      clientSecret: this.cfg.clientSecret,
      username: this.cfg.username,
      password: nodeCrypto.createHash("md5").update(this.cfg.password).digest("hex"),
    });
    const res = await fetch(`${API}/oauth2/token`, { method: "POST", body });
    const json = await res.json();
    if (!json.access_token) {
      throw new Error(`TTLock sign-in failed: ${json.errmsg || json.description || res.status} (code ${json.errcode ?? "?"})`);
    }
    this.token = json.access_token;
  }

  async call<T = any>(method: "GET" | "POST", path: string, params: Record<string, string | number>): Promise<T> {
    if (!this.token) await this.authenticate();
    const p = new URLSearchParams({
      clientId: this.cfg.clientId,
      accessToken: this.token!,
      date: String(Date.now()),
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    const res = method === "GET"
      ? await fetch(`${API}${path}?${p}`)
      : await fetch(`${API}${path}`, { method: "POST", body: p });
    const json = await res.json();
    if (json.errcode && json.errcode !== 0) {
      throw new Error(`TTLock ${path} failed: ${json.errmsg} (code ${json.errcode})`);
    }
    return json as T;
  }

  listLocks() {
    return this.call<{ list: Array<Record<string, unknown>> }>("GET", "/v3/lock/list", { pageNo: 1, pageSize: 50 });
  }

  lockDetail(lockId: number) {
    return this.call("GET", "/v3/lock/detail", { lockId });
  }

  /** Custom 6-digit code via gateway/Wi-Fi (addType=2). Times in ms. */
  addCode(lockId: number, code: string, name: string, start: Date, end: Date) {
    return this.call<{ keyboardPwdId: number }>("POST", "/v3/keyboardPwd/add", {
      lockId, keyboardPwd: code, keyboardPwdName: name,
      startDate: start.getTime(), endDate: end.getTime(), addType: 2,
    });
  }

  deleteCode(lockId: number, keyboardPwdId: number) {
    return this.call("POST", "/v3/keyboardPwd/delete", { lockId, keyboardPwdId, deleteType: 2 });
  }
}

/** Door IDs for this venue's TTLock account (Golf Entry, Darts Door). */
export const DEFAULT_TTLOCK_LOCK_IDS = [26962171, 26952501];

/**
 * Pushes the same code to every venue lock. Exposes the same surface the door
 * code manager already uses, so the rest of the logic is provider-agnostic.
 * provider_ref format: "lockId:keyboardPwdId,lockId:keyboardPwdId".
 */
export class TTLockMultiLock {
  private client: TTLockClient;
  constructor(cfg: NonNullable<ReturnType<typeof getTTLockCredentials>>, private lockIds: number[]) {
    this.client = new TTLockClient(cfg);
  }

  async issueTempPassword(o: { code: string; name: string; effectiveTime: Date; invalidTime: Date }) {
    const refs: string[] = [];
    try {
      for (const lockId of this.lockIds) {
        const r = await this.client.addCode(lockId, o.code, o.name, o.effectiveTime, o.invalidTime);
        refs.push(`${lockId}:${r.keyboardPwdId}`);
      }
    } catch (e) {
      // Roll back doors already done so a failed push never leaves a half-live code.
      await this.deleteTempPassword(refs.join(",")).catch(() => {});
      throw e;
    }
    return { ref: refs.join(","), via: "ttlock" };
  }

  async deleteTempPassword(ref: string) {
    const errors: string[] = [];
    for (const part of String(ref).split(",").filter(Boolean)) {
      const [lockId, pwdId] = part.split(":").map(Number);
      if (!lockId || !pwdId) continue;
      try { await this.client.deleteCode(lockId, pwdId); }
      catch (e) {
        const m = (e as Error).message;
        // Already gone from the lock counts as removed.
        if (!/not exist|-3008|deleted/i.test(m)) errors.push(m);
      }
    }
    if (errors.length) throw new Error(errors.join("; "));
  }

  async listTempPasswords() {
    const out: Record<string, unknown> = {};
    for (const lockId of this.lockIds) {
      out[lockId] = await (this.client as any).call("GET", "/v3/lock/listKeyboardPwd", { lockId, pageNo: 1, pageSize: 100 });
    }
    return out;
  }

  async unlockNow() {
    for (const lockId of this.lockIds) await (this.client as any).call("POST", "/v3/lock/unlock", { lockId });
  }

  async details() {
    const out: Record<string, unknown> = {};
    for (const lockId of this.lockIds) {
      out[lockId] = await this.client.lockDetail(lockId).catch((e) => ({ error: (e as Error).message }));
    }
    return out;
  }
}
