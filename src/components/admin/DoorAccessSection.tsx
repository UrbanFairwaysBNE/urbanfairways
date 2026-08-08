import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, RefreshCw } from "lucide-react";
import { formatBrisbane } from "@/lib/brisbane-time";

interface DoorAccessSettings {
  id: string;
  mode: "fixed" | "daily" | "per_booking" | "unstaffed_only";
  fixed_code: string;
  code_length: number;
  append_hash: boolean;
  valid_from_minutes_before: number;
  valid_until_minutes_after: number;
  provider: "manual" | "tuya";
  tuya_device_id: string | null;
  tuya_region: string;
  enabled: boolean;
}

interface DoorCodeRow {
  id: string;
  code: string;
  status: string;
  valid_from: string;
  valid_until: string;
  provider: string;
  last_error: string | null;
  booking_id: string | null;
  scope?: string;
  label?: string | null;
  is_permanent?: boolean;
}


const MODE_LABELS: Record<DoorAccessSettings["mode"], { label: string; help: string }> = {
  fixed: {
    label: "Fixed shared code",
    help: "One permanent code for everyone. Per-booking codes are only issued if you generate them manually.",
  },
  daily: {
    label: "Daily rotating code",
    help: "A new code is generated each day and used in that day's confirmations.",
  },
  per_booking: {
    label: "Per-booking codes",
    help: "Every confirmed booking gets its own code, valid only around that session.",
  },
  unstaffed_only: {
    label: "Per-booking during unstaffed hours",
    help: "Fixed code while staff are on site, unique per-booking codes outside staffed hours.",
  },
};

/** datetime-local string for "now + n minutes" in Brisbane time. */
const bneLocalInput = (plusMinutes = 0) =>
  new Date(Date.now() + plusMinutes * 60_000 + 10 * 3600 * 1000).toISOString().slice(0, 16);

/** datetime-local value entered as Brisbane time → absolute ISO instant. */
const bneInputToIso = (v: string) => new Date(`${v}:00+10:00`).toISOString();

export function DoorAccessSection() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<DoorAccessSettings | null>(null);
  const [draft, setDraft] = useState<DoorAccessSettings | null>(null);
  const [codes, setCodes] = useState<DoorCodeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Staff test-code panel
  const [testStart, setTestStart] = useState(() => bneLocalInput(2));
  const [testEnd, setTestEnd] = useState(() => bneLocalInput(32));
  const [testCodeInput, setTestCodeInput] = useState("");
  const [issuingTest, setIssuingTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Named staff / contractor codes
  const [namedLabel, setNamedLabel] = useState("");
  const [namedCodeInput, setNamedCodeInput] = useState("");
  const [namedPermanent, setNamedPermanent] = useState(true);
  const [namedExpiry, setNamedExpiry] = useState(() => bneLocalInput(60 * 24 * 30));
  const [issuingNamed, setIssuingNamed] = useState(false);

  // Daily rotating code
  const [rotating, setRotating] = useState(false);


  const load = async () => {
    setIsLoading(true);
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from("door_access_settings").select("*").eq("id", "global").maybeSingle(),
      supabase
        .from("door_codes")
        .select(
          "id, code, status, valid_from, valid_until, provider, last_error, booking_id, scope, label, is_permanent",
        )
        .in("status", ["pending", "active"])
        .order("valid_from", { ascending: true })
        .limit(50),
    ]);
    if (s) {
      setSettings(s as unknown as DoorAccessSettings);
      setDraft(s as unknown as DoorAccessSettings);
    }
    setCodes((c as DoorCodeRow[]) || []);
    setIsLoading(false);
  };



  useEffect(() => {
    load();
  }, []);

  const dirty = JSON.stringify(settings) !== JSON.stringify(draft);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const { id, ...payload } = draft;
    const { error } = await supabase
      .from("door_access_settings")
      .update(payload as any)
      .eq("id", "global");
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive", duration: 4000 });
      return;
    }
    // Keep the legacy system_settings.door_code in sync so existing templates keep working
    await supabase.from("system_settings").update({ door_code: draft.fixed_code } as any).eq("id", "global");
    setSettings(draft);
    toast({ title: "Door access settings saved", duration: 3000 });
  };

  const issueTestCode = async () => {
    setIssuingTest(true);
    setTestResult(null);
    const startedAt = Date.now();
    const { data, error } = await supabase.functions.invoke("door-code-manager", {
      body: {
        action: "issue_test",
        valid_from: bneInputToIso(testStart),
        valid_until: bneInputToIso(testEnd),
        code: testCodeInput.replace(/\D/g, "") || undefined,
        label: "Staff test",
      },
    });
    const roundTrip = Date.now() - startedAt;
    setIssuingTest(false);
    if (error || !data?.success) {
      const msg = error?.message || data?.error || "Unknown error";
      setTestResult(`❌ ${msg}`);
      toast({ title: "Test code failed", description: msg, variant: "destructive", duration: 6000 });
      load();
      return;
    }
    setTestResult(
      `✅ Code ${data.code} pushed via ${data.via} in ${data.push_ms}ms (round trip ${roundTrip}ms).\n` +
        `Valid ${formatBrisbane(data.valid_from)} → ${formatBrisbane(data.valid_until)} (Brisbane).`,
    );
    toast({ title: `Test code ${data.code} issued`, duration: 5000 });
    load();
  };

  const issueNamed = async () => {
    if (!namedLabel.trim()) {
      toast({ title: "Add a name first", variant: "destructive", duration: 3000 });
      return;
    }
    setIssuingNamed(true);
    const { data, error } = await supabase.functions.invoke("door-code-manager", {
      body: {
        action: "issue_named",
        label: namedLabel.trim(),
        code: namedCodeInput.replace(/\D/g, "") || undefined,
        permanent: namedPermanent,
        valid_until: namedPermanent ? undefined : bneInputToIso(namedExpiry),
      },
    });
    setIssuingNamed(false);
    if (error || !data?.success) {
      const msg = error?.message || data?.error || "Unknown error";
      toast({ title: "Could not issue code", description: msg, variant: "destructive", duration: 6000 });
      load();
      return;
    }
    toast({
      title: `${data.code} assigned to ${namedLabel.trim()}`,
      description: namedPermanent ? "Permanent (no expiry)" : `Expires ${formatBrisbane(data.valid_until)}`,
      duration: 6000,
    });
    setNamedLabel("");
    setNamedCodeInput("");
    load();
  };


  const revoke = async (id: string) => {
    const { error } = await supabase.functions.invoke("door-code-manager", {
      body: { action: "revoke", door_code_id: id },
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive", duration: 4000 });
      return;
    }
    toast({ title: "Code revoked", duration: 3000 });
    load();
  };

  if (isLoading || !draft) return <Skeleton className="h-64" />;

  const set = <K extends keyof DoorAccessSettings>(key: K, value: DoorAccessSettings[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const staffCodes = codes.filter((c) => c.scope === "staff");
  const dailyCode = codes.find((c) => c.scope === "daily") || null;
  const otherCodes = codes.filter((c) => c.scope !== "staff" && c.scope !== "daily");

  const rotateDaily = async (rotate: boolean) => {
    setRotating(true);
    const { data, error } = await supabase.functions.invoke("door-code-manager", {
      body: { action: "daily_ensure", rotate },
    });
    setRotating(false);
    if (error || !data?.success) {
      const msg = error?.message || data?.error || "Unknown error";
      toast({ title: "Could not rotate daily code", description: msg, variant: "destructive", duration: 6000 });
    } else {
      toast({ title: `Today's code is ${data.code}`, duration: 5000 });
    }
    load();
  };



  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Door Code
          </CardTitle>
          <CardDescription>
            Controls the code used by any email or SMS template containing{" "}
            <code className="text-xs">{"{door_code}"}</code>. When per-booking codes are active the
            tag resolves to that booking's code; otherwise it falls back to the fixed code.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="max-w-md space-y-2">
            <Label>Code mode</Label>
            <Select value={draft.mode} onValueChange={(v) => set("mode", v as DoorAccessSettings["mode"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MODE_LABELS) as DoorAccessSettings["mode"][]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODE_LABELS[m].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{MODE_LABELS[draft.mode].help}</p>
          </div>

          {draft.mode === "daily" && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2 max-w-md">
                <Label>Today's code</Label>
                {dailyCode ? (
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-2xl tracking-widest">
                      {dailyCode.code}
                      {draft.append_hash ? "#" : ""}
                    </span>
                    <Badge variant={dailyCode.status === "active" ? "default" : "secondary"}>
                      {dailyCode.status}
                    </Badge>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No code activated for today yet.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  At 4:00am Brisbane the previous day's code is revoked and the next pre-generated
                  code is pushed to the keypad.
                  {dailyCode &&
                    ` Valid until ${formatBrisbane(dailyCode.valid_until)} (Brisbane).`}
                </p>
                <Button variant="outline" size="sm" onClick={() => rotateDaily(!!dailyCode)} disabled={rotating}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${rotating ? "animate-spin" : ""}`} />
                  {dailyCode ? "Rotate code now" : "Activate today's code"}
                </Button>
              </div>

              <DailyCodeCalendar appendHash={draft.append_hash} />
            </div>
          )}


          <div className="max-w-sm space-y-2">
            <Label>Fixed / fallback code</Label>
            <Input
              value={draft.fixed_code}
              onChange={(e) => set("fixed_code", e.target.value)}
              placeholder="e.g. 7675#"
            />
            <p className="text-xs text-muted-foreground">
              Used in fixed mode, and as the fallback whenever a booking has no code of its own.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
            <div className="space-y-2">
              <Label>Valid from (min before start)</Label>
              <Input
                type="number"
                min={0}
                max={240}
                value={draft.valid_from_minutes_before}
                onChange={(e) => set("valid_from_minutes_before", parseInt(e.target.value || "0", 10))}
              />
            </div>
            <div className="space-y-2">
              <Label>Expires (min after end)</Label>
              <Input
                type="number"
                min={0}
                max={240}
                value={draft.valid_until_minutes_after}
                onChange={(e) => set("valid_until_minutes_after", parseInt(e.target.value || "0", 10))}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="append_hash"
              checked={draft.append_hash}
              onCheckedChange={(v) => set("append_hash", v)}
            />
            <Label htmlFor="append_hash" className="text-sm">
              Show codes with a trailing <code className="text-xs">#</code> in messages
            </Label>
          </div>

          <div className="flex items-center gap-3">
            <Switch id="dc_enabled" checked={draft.enabled} onCheckedChange={(v) => set("enabled", v)} />
            <Label htmlFor="dc_enabled" className="text-sm">
              Push codes to the keypad
            </Label>
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? "Saving..." : "Save settings"}
            </Button>
          </div>

        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Named Codes (Staff & Contractors)
          </CardTitle>
          <CardDescription>
            Assign a code to a person — staff, cleaner, contractor — and revoke it instantly when
            they no longer need access. Tuya has no separate "permanent code" API, so a permanent
            code is issued with a 10-year expiry; it behaves exactly like a fixed code and can be
            removed from the keypad at any time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3 max-w-3xl">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={namedLabel}
                onChange={(e) => setNamedLabel(e.target.value)}
                placeholder="e.g. Sam — Cleaner"
              />
            </div>
            <div className="space-y-2">
              <Label>Code (optional)</Label>
              <Input
                value={namedCodeInput}
                onChange={(e) => setNamedCodeInput(e.target.value)}
                placeholder="Auto-generated"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label>Expires (Brisbane)</Label>
              <Input
                type="datetime-local"
                value={namedExpiry}
                onChange={(e) => setNamedExpiry(e.target.value)}
                disabled={namedPermanent}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch id="named_permanent" checked={namedPermanent} onCheckedChange={setNamedPermanent} />
            <Label htmlFor="named_permanent" className="text-sm">
              Permanent (no expiry)
            </Label>
          </div>

          <Button onClick={issueNamed} disabled={issuingNamed}>
            {issuingNamed ? "Pushing to keypad..." : "Create code"}
          </Button>

          <div className="space-y-2">
            {staffCodes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No named codes yet.</p>
            ) : (
              staffCodes.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 border rounded-lg p-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium break-words">{c.label || "Unnamed"}</span>
                      <span className="font-mono font-semibold">{c.code}</span>
                      <Badge variant={c.status === "active" ? "default" : "secondary"} className="text-xs">
                        {c.status}
                      </Badge>
                      {c.is_permanent && (
                        <Badge variant="outline" className="text-xs">
                          permanent
                        </Badge>
                      )}
                    </div>
                    {!c.is_permanent && (
                      <p className="text-xs text-muted-foreground mt-1 break-words">
                        Expires {formatBrisbane(c.valid_until)}
                      </p>
                    )}
                    {c.last_error && (
                      <p className="text-xs text-destructive mt-1 break-words">{c.last_error}</p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => revoke(c.id)}>
                    Revoke
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Staff Test Code
          </CardTitle>
          <CardDescription>
            Pushes a real temporary code to the keypad for a window you choose (Brisbane time),
            without touching customer bookings. Works even while "Push codes to the keypad" is off,
            so the permanent code and live confirmations are unaffected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3 max-w-3xl">
            <div className="space-y-2">
              <Label>Valid from (Brisbane)</Label>
              <Input
                type="datetime-local"
                value={testStart}
                onChange={(e) => setTestStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Valid until (Brisbane)</Label>
              <Input
                type="datetime-local"
                value={testEnd}
                onChange={(e) => setTestEnd(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Code (optional)</Label>
              <Input
                value={testCodeInput}
                onChange={(e) => setTestCodeInput(e.target.value)}
                placeholder="Auto-generated"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={issueTestCode} disabled={issuingTest}>
              {issuingTest ? "Pushing to keypad..." : "Issue test code"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setTestStart(bneLocalInput(2));
                setTestEnd(bneLocalInput(32));
              }}
            >
              Now + 30 min
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setTestStart(bneLocalInput(60));
                setTestEnd(bneLocalInput(75));
              }}
            >
              In 1 hour, 15 min window
            </Button>
          </div>

          {testResult && (
            <pre className="bg-muted/40 rounded p-3 text-xs whitespace-pre-wrap">{testResult}</pre>
          )}

          <p className="text-xs text-muted-foreground">
            Test the three things that matter: the code works from its start time, it is rejected
            before it starts, and it is rejected after it expires. Revoke it below at any point to
            check that removal is instant too.
          </p>
        </CardContent>
      </Card>


      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Active Codes</CardTitle>
            <CardDescription>Codes currently issued or scheduled.</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={load}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {otherCodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active codes.</p>
          ) : (
            otherCodes.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 border rounded-lg p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold">{c.code}</span>
                    <Badge variant={c.status === "active" ? "default" : "secondary"} className="text-xs">
                      {c.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {c.provider}
                    </Badge>
                    {c.scope === "test" && (
                      <Badge variant="outline" className="text-xs">
                        staff test
                      </Badge>
                    )}

                  </div>
                  <p className="text-xs text-muted-foreground mt-1 break-words">
                    {formatBrisbane(c.valid_from)} → {formatBrisbane(c.valid_until)}
                  </p>
                  {c.last_error && (
                    <p className="text-xs text-destructive mt-1 break-words">{c.last_error}</p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => revoke(c.id)}>
                  Revoke
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
