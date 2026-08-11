import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Go-live testing schedule. Purely an operational checklist — state is kept in
 * localStorage on the admin's device, nothing is written to the backend.
 */

type Confidence = "high" | "medium" | "low";

interface TestItem {
  id: string;
  label: string;
  pass: string;
  confidence: Confidence;
}

interface TestCategory {
  id: string;
  title: string;
  why: string;
  items: TestItem[];
}

const CONFIDENCE_META: Record<Confidence, { label: string; className: string; hint: string }> = {
  high: {
    label: "High",
    className: "bg-primary/10 text-primary border-primary/30",
    hint: "Logic proven at the source venue and config verified here — smoke test only.",
  },
  medium: {
    label: "Medium",
    className: "bg-accent/15 text-accent-foreground border-accent/40",
    hint: "Proven logic but venue-specific config or newer code — test properly once.",
  },
  low: {
    label: "Low",
    className: "bg-destructive/10 text-destructive border-destructive/30",
    hint: "Never exercised on this project — must be tested end to end.",
  },
};

const CATEGORIES: TestCategory[] = [
  {
    id: "config",
    title: "0. Config sweep (do first, no customers needed)",
    why: "Almost every go-live failure here will be config or credentials, not logic. Nothing below this section is meaningful until these pass.",
    items: [
      {
        id: "cfg-email",
        label: "Send a test email and confirm delivery to Gmail AND Outlook",
        pass: "Arrives in inbox, not spam, from the tenant sender address with the branded header/footer.",
        confidence: "low",
      },
      {
        id: "cfg-stripe-mode",
        label: "Confirm Stripe keys are the intended mode (test vs live)",
        pass: "Keys match the mode you plan to trade in on day one.",
        confidence: "low",
      },
      {
        id: "cfg-webhook",
        label: "Point the Stripe webhook at this project and fire a test event",
        pass: "A row appears in stripe_processed_events. This is the single biggest risk.",
        confidence: "low",
      },
      {
        id: "cfg-door",
        label: "Enable door access and confirm the code source",
        pass: "A booking confirmation email carries a code that actually opens the door.",
        confidence: "low",
      },
      {
        id: "cfg-devices",
        label: "Create bay_devices rows for every bay (1–7)",
        pass: "All 7 bays appear in Bay Control with plugs and app paths set.",
        confidence: "medium",
      },
      {
        id: "cfg-holidays",
        label: "Populate public holidays for the next 12 months",
        pass: "A holiday date prices as peak, not off-peak.",
        confidence: "medium",
      },
      {
        id: "cfg-cron",
        label: "Confirm scheduled jobs exist (pack expiry, daily door code, promos, SGT sync, stale-pending cleanup)",
        pass: "Each job listed and last-run timestamps advancing. These fail silently.",
        confidence: "low",
      },
      {
        id: "cfg-admin2",
        label: "Add a second admin account",
        pass: "Second account can reach /admin. Removes the single point of failure.",
        confidence: "high",
      },
    ],
  },
  {
    id: "casual",
    title: "1. Casual bookings — peak / off-peak",
    why: "The money path with the widest exposure. If pricing, charging and confirmation work once end to end, the same code path serves every other booking type.",
    items: [
      {
        id: "cas-offpeak",
        label: "Book an off-peak hour (weekday before 4pm) as a Casual customer",
        pass: "Charged the off-peak rate from pricing_config, booking flips to confirmed.",
        confidence: "medium",
      },
      {
        id: "cas-peak",
        label: "Book a peak hour (weekday evening) as a Casual customer",
        pass: "Charged the peak rate.",
        confidence: "medium",
      },
      {
        id: "cas-boundary",
        label: "Book a session that straddles the 4:00pm off-peak/peak boundary",
        pass: "Split pricing is correct — this is the one edge case worth checking by hand.",
        confidence: "medium",
      },
      {
        id: "cas-weekend",
        label: "Book a Saturday 9:00am slot and a Saturday 11:00am slot",
        pass: "First is off-peak, second is peak (weekend off-peak ends 10:00am).",
        confidence: "medium",
      },
      {
        id: "cas-savedcard",
        label: "Save a card, then book again using the saved card",
        pass: "No card re-entry, charge succeeds, confirmation email + door code arrive.",
        confidence: "high",
      },
      {
        id: "cas-tamper",
        label: "Confirm the server rejects a tampered price",
        pass: "charge-booking recomputes from pricing_config and clamps the amount — spot check the logs show the server figure.",
        confidence: "medium",
      },
    ],
  },
  {
    id: "membership",
    title: "2. Memberships & billing",
    why: "One clean tier signup plus one tier switch validates the whole subscription architecture — every tier reads the same pricing_config flags, so if one tier behaves, the others follow.",
    items: [
      {
        id: "mem-join",
        label: "Join a mid-tier membership with a real card",
        pass: "Charged immediately; tier appears on the profile ONLY after the webhook, not on redirect.",
        confidence: "medium",
      },
      {
        id: "mem-price",
        label: "Book a bay as that member",
        pass: "Charged the member hourly rate, not the casual rate.",
        confidence: "high",
      },
      {
        id: "mem-switch",
        label: "Switch to a higher tier",
        pass: "Exactly ONE subscription in Stripe, prorated, billing date unchanged.",
        confidence: "medium",
      },
      {
        id: "mem-frontline",
        label: "Sign up to Frontline",
        pass: "Sector picker appears, verification alert email lands with the admin address.",
        confidence: "medium",
      },
      {
        id: "mem-fail",
        label: "Simulate a declined renewal (Stripe test card)",
        pass: "First failure: casual pricing forced, heads-up email, self-serve retry works. Second failure: downgraded to Casual.",
        confidence: "medium",
      },
      {
        id: "mem-cancel",
        label: "Cancel a membership",
        pass: "Subscription cancels, tier reverts, confirmation email names the correct tier.",
        confidence: "high",
      },
    ],
  },
  {
    id: "changes",
    title: "3. Reschedule, cancel & extend",
    why: "These share one guard (a booking is 'live' 10 minutes after start). Prove the guard once and the rest is the same branch.",
    items: [
      {
        id: "chg-reschedule",
        label: "Reschedule a future booking to a different day/bay",
        pass: "Old slot frees, new slot holds, reschedule email sent, no second charge.",
        confidence: "high",
      },
      {
        id: "chg-reschedule-price",
        label: "Reschedule off-peak → peak",
        pass: "Price difference handled correctly (charged or credited), not silently absorbed.",
        confidence: "medium",
      },
      {
        id: "chg-cancel",
        label: "Cancel a future booking outside the 6-hour window",
        pass: "Refunded to the original method, cancellation email sent.",
        confidence: "high",
      },
      {
        id: "chg-cancel-late",
        label: "Try to cancel a booking that started 15 minutes ago",
        pass: "Blocked with a clear message, in the UI and in the edge function.",
        confidence: "high",
      },
      {
        id: "chg-extend",
        label: "Extend a live booking by 30 minutes",
        pass: "Charged correctly, end time moves, Bay Controller respects the new end.",
        confidence: "medium",
      },
      {
        id: "chg-extend-blocked",
        label: "Try to extend when the next slot is already booked",
        pass: "Extension refused.",
        confidence: "high",
      },
    ],
  },
  {
    id: "credits",
    title: "4. Credits, packs & gift cards",
    why: "All three reduce the card charge before Stripe is called. One partial-payment test proves the ledger maths for all of them.",
    items: [
      {
        id: "cr-full",
        label: "Admin adds credit, customer books a slot fully covered by it",
        pass: "Card charged $0, ledger row written, balance decremented.",
        confidence: "medium",
      },
      {
        id: "cr-partial",
        label: "Book a slot with only partial credit available",
        pass: "Credit applied first, remainder on card. This is the key test.",
        confidence: "medium",
      },
      {
        id: "cr-pack-buy",
        label: "Buy a prepaid pack",
        pass: "Pack lot created, balance shows in My Account.",
        confidence: "medium",
      },
      {
        id: "cr-pack-use",
        label: "Book using pack hours",
        pass: "Hours deducted correctly, no card charge, balance badge updates.",
        confidence: "medium",
      },
      {
        id: "cr-gift",
        label: "Issue a gift card and redeem it on a new account",
        pass: "Branded email delivered with the personal message, credit lands on signup.",
        confidence: "medium",
      },
      {
        id: "cr-refund",
        label: "Cancel a booking that was paid with credit",
        pass: "Credit returned to the ledger, not refunded to a card.",
        confidence: "medium",
      },
    ],
  },
  {
    id: "corporate",
    title: "5. Corporate accounts (new — not inherited)",
    why: "The only major feature with no production history anywhere. Test this properly; do not assume.",
    items: [
      {
        id: "corp-create",
        label: "Create a corporate account and invite two staff",
        pass: "Both staff link to the shared wallet.",
        confidence: "low",
      },
      {
        id: "corp-spend",
        label: "Both staff book on the same day",
        pass: "Shared wallet decrements once per booking, no double-spend.",
        confidence: "low",
      },
      {
        id: "corp-cap",
        label: "Push one staff member past their monthly cap",
        pass: "Blocked with a clear message; other staff unaffected.",
        confidence: "low",
      },
      {
        id: "corp-remove",
        label: "Remove corporate status from the parent customer",
        pass: "All staff unlinked and returned to standard pricing.",
        confidence: "medium",
      },
    ],
  },
  {
    id: "automation",
    title: "6. Bay Controller & automation",
    why: "Logic is inherited and proven; what is new here is per-bay config (paths, displays, plug MACs). Run the full timeline on one bay, then a short smoke test on the other six.",
    items: [
      {
        id: "auto-timeline",
        label: "Book a bay 5 minutes out and watch the full timeline",
        pass: "Hardware on T−3m, apps launch T−1m, apps close T−20s, power off T+0.",
        confidence: "high",
      },
      {
        id: "auto-b2b",
        label: "Back-to-back bookings on one bay",
        pass: "No close and no power-off between sessions.",
        confidence: "high",
      },
      {
        id: "auto-cancel",
        label: "Cancel a booking during PRE_START",
        pass: "No phantom launch, plug powers off.",
        confidence: "high",
      },
      {
        id: "auto-reschedule",
        label: "Reschedule to a different bay mid-arming",
        pass: "Old bay stands down, new bay arms.",
        confidence: "medium",
      },
      {
        id: "auto-watchdog",
        label: "Kill the controller / reboot a bay PC mid-session",
        pass: "Watchdog relaunches within a minute, single instance only, re-arms from cloud.",
        confidence: "medium",
      },
      {
        id: "auto-dhcp",
        label: "Force a DHCP change on a plug (Mango bench)",
        pass: "Plug still controllable — MAC re-resolves to the new IP.",
        confidence: "medium",
      },
      {
        id: "auto-allbays",
        label: "Smoke test each of bays 1–7 (power on + app launch)",
        pass: "Every bay behaves identically. Differences will be config, not code.",
        confidence: "medium",
      },
    ],
  },
  {
    id: "comms",
    title: "7. Access, emails & notifications",
    why: "Template variants branch on staffed hours and first-time status. Check one of each variant rather than all 24 templates.",
    items: [
      {
        id: "com-code",
        label: "Use the door code from a confirmation email at the booked time",
        pass: "Door opens.",
        confidence: "low",
      },
      {
        id: "com-code-out",
        label: "Try the same code well outside the booking window",
        pass: "Does not work (or matches your intended daily-code policy).",
        confidence: "low",
      },
      {
        id: "com-unstaffed",
        label: "Book inside the unstaffed window",
        pass: "Unstaffed template variant sent, with the correct access instructions.",
        confidence: "medium",
      },
      {
        id: "com-firsttime",
        label: "Book as a brand-new customer",
        pass: "First-timer variant sent; first-session promo credit applied if active.",
        confidence: "medium",
      },
      {
        id: "com-links",
        label: "Click every link in one confirmation and one cancellation email",
        pass: "All absolute URLs resolve to the correct domain.",
        confidence: "high",
      },
    ],
  },
  {
    id: "admin",
    title: "8. Admin & operations",
    why: "Day-one staff workflows. Quick to run, and these are the manual overrides you rely on when something else breaks.",
    items: [
      {
        id: "adm-add",
        label: "Add a booking from the admin timetable for a walk-in",
        pass: "Booking appears, customer notified (or suppressed, as chosen).",
        confidence: "high",
      },
      {
        id: "adm-block",
        label: "Block a bay for maintenance",
        pass: "Slot disappears from public availability immediately.",
        confidence: "high",
      },
      {
        id: "adm-refund",
        label: "Refund from admin, with and without notification",
        pass: "Stripe refund created, email behaviour matches the toggle.",
        confidence: "high",
      },
      {
        id: "adm-pos",
        label: "Take a POS sale, including a golf category item and a card payment",
        pass: "Sale recorded, terminal charges, totals appear in sales reporting.",
        confidence: "medium",
      },
      {
        id: "adm-pricing",
        label: "Change an hourly rate in Settings → Pricing",
        pass: "New Stripe price created, old archived, new rate applies to the next booking.",
        confidence: "medium",
      },
    ],
  },
  {
    id: "league",
    title: "9. League & competitions (can slip past go-live)",
    why: "Entirely unconfigured on this project. Nothing here blocks opening day, but the whole flow needs a dry run before the first league week.",
    items: [
      {
        id: "lg-creds",
        label: "Configure SGT club + API credentials and run Test Connection",
        pass: "Connection succeeds, club/tour resolve.",
        confidence: "low",
      },
      {
        id: "lg-register",
        label: "Register a player in-app and approve their handicap",
        pass: "Registration order club → tour → tournament completes.",
        confidence: "low",
      },
      {
        id: "lg-round",
        label: "Enter a full 18-hole scorecard",
        pass: "Round counts, player shows (E) until enough rounds, then a true handicap.",
        confidence: "low",
      },
      {
        id: "lg-close",
        label: "Let a tournament run to Monday 6:00am Brisbane",
        pass: "Auto-close fires, standings recalculate, winner shows.",
        confidence: "low",
      },
      {
        id: "lg-comp",
        label: "Run one local comp end to end with the active toggle and schedule",
        pass: "Comp opens on schedule, scores enter, leaderboard updates.",
        confidence: "medium",
      },
    ],
  },
];

const STORAGE_KEY = "uf-testing-schedule-v1";

export function TestingSchedule() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setDone(JSON.parse(raw));
    } catch {
      /* ignore corrupt state */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(done));
    } catch {
      /* storage full or blocked */
    }
  }, [done, loaded]);

  const allItems = useMemo(() => CATEGORIES.flatMap((c) => c.items), []);
  const completed = allItems.filter((i) => done[i.id]).length;
  const percent = Math.round((completed / allItems.length) * 100);

  const toggle = (id: string) => setDone((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="font-display text-lg uppercase tracking-wide">
                Go-live testing schedule
              </CardTitle>
              <CardDescription>
                Work top to bottom. Ticks are saved on this device only.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={percent === 100 ? "default" : "secondary"}>
                {completed} / {allItems.length}
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => setDone({})}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={percent} />
          <p className="text-sm text-muted-foreground">
            These flows share one codebase and one set of helpers. If a membership signup
            prices, charges, webhooks and emails correctly, the remaining tiers use the exact
            same path and can be treated as reliable — the same goes for bookings across bays.
            So the tests below are deliberately weighted towards <strong>one deep test per
            pattern</strong>, plus the boundaries and the genuinely new code (corporate
            wallet, plug binding, league).
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {(Object.keys(CONFIDENCE_META) as Confidence[]).map((c) => (
              <span
                key={c}
                className={cn(
                  "text-xs rounded-full border px-2 py-1",
                  CONFIDENCE_META[c].className,
                )}
                title={CONFIDENCE_META[c].hint}
              >
                {CONFIDENCE_META[c].label} confidence — {CONFIDENCE_META[c].hint}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {CATEGORIES.map((category, index) => {
        const catDone = category.items.filter((i) => done[i.id]).length;
        const complete = catDone === category.items.length;
        return (
          <Collapsible key={category.id} defaultOpen={index === 0}>
            <Card>
              <CollapsibleTrigger className="w-full text-left group">
                <CardHeader className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{category.title}</CardTitle>
                      <CardDescription className="line-clamp-2">{category.why}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={complete ? "default" : "secondary"}>
                        {catDone}/{category.items.length}
                      </Badge>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-2 pt-0">
                  {category.items.map((item) => (
                    <label
                      key={item.id}
                      htmlFor={item.id}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer transition-colors",
                        done[item.id] ? "bg-muted/50" : "hover:bg-muted/30",
                      )}
                    >
                      <Checkbox
                        id={item.id}
                        checked={!!done[item.id]}
                        onCheckedChange={() => toggle(item.id)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "text-sm font-medium text-foreground",
                              done[item.id] && "line-through text-muted-foreground",
                            )}
                          >
                            {item.label}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] uppercase tracking-wide rounded-full border px-1.5 py-0.5",
                              CONFIDENCE_META[item.confidence].className,
                            )}
                          >
                            {CONFIDENCE_META[item.confidence].label}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground break-words">
                          <span className="font-medium text-foreground/70">Pass: </span>
                          {item.pass}
                        </p>
                      </div>
                    </label>
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}
