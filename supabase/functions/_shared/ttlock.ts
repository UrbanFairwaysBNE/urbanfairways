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

  private async call<T = any>(method: "GET" | "POST", path: string, params: Record<string, string | number>): Promise<T> {
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
