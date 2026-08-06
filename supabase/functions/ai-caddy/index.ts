// AI Caddy — admin/staff support assistant
// Non-streaming chat with tool-calling. Uses Lovable AI Gateway.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { loadTiers, TierRow } from "../_shared/tiers.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { getTenant, type TenantConfig } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2025-07-30.basil" });

// ---------- Tool definitions (OpenAI-compatible) ----------
const tools = [
  {
    type: "function",
    function: {
      name: "find_customer",
      description: "Find a customer by email, phone, or name. Returns up to 5 matching profiles with id, name, email, phone, membership_tier, deposit_balance, total_bookings, payment_failed_at, booking_flag_enabled.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "email, phone (any format), or full/partial name" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_bookings",
      description: "List recent bookings for a customer by user_id (uuid). Default last 20.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string" },
          limit: { type: "number", description: "default 20, max 100" },
        },
        required: ["user_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_booking",
      description: "Get a single booking by id with bay name and customer details.",
      parameters: { type: "object", properties: { booking_id: { type: "string" } }, required: ["booking_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_edge_logs",
      description: "Fetch recent rows from an internal log table. Allowed tables: adhoc_sms_log, bay_controller_logs, deposit_transactions, membership_changes, membership_payments, local_hcp_adjustments. Default limit 25.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: ["adhoc_sms_log", "bay_controller_logs", "deposit_transactions", "membership_changes", "membership_payments", "local_hcp_adjustments"] },
          filter_column: { type: "string", description: "optional eq filter column" },
          filter_value: { type: "string", description: "optional eq filter value" },
          limit: { type: "number" },
        },
        required: ["table"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_stripe_events_for_customer",
      description: "List recent Stripe charges/refunds/subscription events for a customer by email. Returns up to 15 items.",
      parameters: { type: "object", properties: { email: { type: "string" } }, required: ["email"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sgt_status",
      description: "Get current active SGT tour & tournament, plus the user's registration / scorecard if user_id is given.",
      parameters: { type: "object", properties: { user_id: { type: "string", description: "optional" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "list_bays",
      description: "List all bays (id, number, name, location) — use this to resolve a bay name/number to its uuid before create_booking.",
      parameters: { type: "object", properties: {} },
    },
  },
  // -------- ACTIONS (require confirmed=true) --------
  {
    type: "function",
    function: {
      name: "refund_booking",
      description: "Refund a booking via Stripe (full refund) AND cancel it, via the admin refund-booking edge function (same path used by the admin UI — sends customer notification). DESTRUCTIVE — requires confirmed=true.",
      parameters: {
        type: "object",
        properties: {
          booking_id: { type: "string" },
          reason: { type: "string" },
          send_notification: { type: "boolean", description: "default true — emails the customer" },
          confirmed: { type: "boolean", description: "must be true to actually execute" },
        },
        required: ["booking_id", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "adjust_customer_credit",
      description: "Add or deduct deposit_balance for a customer. DESTRUCTIVE — requires confirmed=true. Use negative amount to deduct.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string" },
          amount: { type: "number", description: "dollars, can be negative" },
          note: { type: "string" },
          confirmed: { type: "boolean" },
        },
        required: ["user_id", "amount", "note"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_booking",
      description: "Create an admin booking for a customer (mirrors the admin Add Booking dialog: confirmed status, payment_method=pending, sends booking confirmation email). DESTRUCTIVE — requires confirmed=true. Checks for overlaps; will fail if the slot is already taken.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "customer profile user_id (uuid)" },
          bay_id: { type: "string", description: "bay uuid" },
          booking_date: { type: "string", description: "YYYY-MM-DD" },
          start_time: { type: "string", description: "HH:MM (24h)" },
          duration_hours: { type: "number", description: "1, 2, 3 or 4" },
          player_count: { type: "number", description: "1-6, default 1" },
          hourly_rate: { type: "number", description: "$/hr — if omitted, defaults to $35 (admin can adjust later)" },
          confirmed: { type: "boolean" },
        },
        required: ["user_id", "bay_id", "booking_date", "start_time", "duration_hours"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_customer",
      description: "Update a customer profile (same fields exposed in the admin Customers UI). DESTRUCTIVE — requires confirmed=true. Allowed fields: first_name, last_name, phone, custom_segment ('staff'|'vip'|'comp'|null), booking_flag_enabled (alerts staff on booking), membership_on_hold, custom_billing, custom_hourly_rate.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          phone: { type: "string" },
          custom_segment: { type: "string" },
          booking_flag_enabled: { type: "boolean" },
          membership_on_hold: { type: "boolean" },
          custom_billing: { type: "boolean" },
          custom_hourly_rate: { type: "number" },
          confirmed: { type: "boolean" },
        },
        required: ["user_id", "confirmed"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_customer",
      description: "Create a new customer account via the admin create-customer edge function (same path used by the admin UI: creates auth user + profile, sends a welcome/onboarding email). DESTRUCTIVE — requires confirmed=true.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string" },
          firstName: { type: "string" },
          lastName: { type: "string" },
          phone: { type: "string" },
          confirmed: { type: "boolean" },
        },
        required: ["email", "firstName", "lastName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_membership",
      description: "Cancel a customer's membership subscription via the cancel-membership edge function (same path as the admin/customer-facing UI: cancels Stripe subscription, downgrades tier). DESTRUCTIVE — requires confirmed=true.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string" },
          confirmed: { type: "boolean" },
        },
        required: ["user_id"],
      },
    },
  },
  // -------- REPORTING --------
  {
    type: "function",
    function: {
      name: "run_report",
      description: `Generate a flexible read-only report. Use for any "how many", "show me", "list", "breakdown", "total", "top X", or marketing contact-list questions.

Entities:
- bookings — date_col: booking_date. metrics: count, revenue, avg_price, total_players. dims: status, bay_id, peak_pricing, player_count, user_id
- customer_contacts — profiles for marketing exports. date_col: created_at. dims: membership_tier, custom_segment, booking_flag_enabled. Returns full contact rows (email, name, phone) UNLESS group_by is set.
- pos_transactions — date_col: created_at. metrics: count, revenue. dims: payment_method, status
- membership_payments — date_col: created_at. metrics: count, revenue. dims: status, tier
- membership_changes — date_col: created_at. metrics: count. dims: previous_tier, new_tier
- gift_cards — date_col: created_at. metrics: count, revenue. dims: status
- deposit_transactions — date_col: created_at. metrics: count, revenue. dims: transaction_type
- sgt_scorecards — date_col: created_at. metrics: count, avg_gross, avg_net. dims: tournament_id, is_complete
- local_competitions — date_col: date. metrics: count. dims: status

group_by_date grain: day, week, month, dow, hour — grouped in Australia/Brisbane.
Filters: array of { column, op, value }; op ∈ eq, neq, gte, lte, in, ilike.
For marketing: entity=customer_contacts, set filters (e.g. membership_tier in ['member_birdie']), do NOT set group_by — returns contact rows directly. Always includes a CSV download.`,
      parameters: {
        type: "object",
        properties: {
          entity: { type: "string", enum: ["bookings","customer_contacts","pos_transactions","membership_payments","membership_changes","gift_cards","deposit_transactions","sgt_scorecards","local_competitions"] },
          from_date: { type: "string", description: "YYYY-MM-DD Brisbane. Default 90 days ago." },
          to_date: { type: "string", description: "YYYY-MM-DD Brisbane. Default today." },
          filters: {
            type: "array",
            items: {
              type: "object",
              properties: {
                column: { type: "string" },
                op: { type: "string", enum: ["eq","neq","gte","lte","in","ilike"] },
                value: {},
              },
              required: ["column","op","value"],
            },
          },
          group_by: { type: "array", items: { type: "string" } },
          group_by_date: { type: "string", enum: ["day","week","month","dow","hour"] },
          metrics: { type: "array", items: { type: "string" } },
          order_by: { type: "string" },
          order_desc: { type: "boolean" },
          limit: { type: "number", description: "default 100, max 1000 (contacts max 5000)" },
        },
        required: ["entity"],
      },
    },
  },
];

// ---------- Report entity catalog ----------
const ENTITIES: Record<string, any> = {
  bookings: {
    table: "bookings",
    select: "id,user_id,bay_id,booking_date,start_time,end_time,status,total_price,player_count,peak_pricing,created_at",
    date_col: "booking_date",
    dims: ["status","bay_id","peak_pricing","player_count","user_id"],
    metrics: {
      count:         (rows: any[]) => rows.length,
      revenue:       (rows: any[]) => round(rows.reduce((s,r) => s + Number(r.total_price ?? 0), 0)),
      avg_price:     (rows: any[]) => rows.length ? round(rows.reduce((s,r) => s + Number(r.total_price ?? 0), 0) / rows.length) : 0,
      total_players: (rows: any[]) => rows.reduce((s,r) => s + Number(r.player_count ?? 0), 0),
    },
  },
  customer_contacts: {
    table: "profiles",
    select: "user_id,first_name,last_name,email,phone,membership_tier,custom_segment,deposit_balance,total_bookings,booking_flag_enabled,payment_failed_at,created_at",
    date_col: "created_at",
    dims: ["membership_tier","custom_segment","booking_flag_enabled"],
    metrics: { count: (rows: any[]) => rows.length },
    is_contact_list: true,
  },
  pos_transactions: {
    table: "pos_transactions",
    select: "id,amount,payment_method,status,created_at",
    date_col: "created_at",
    dims: ["payment_method","status"],
    metrics: {
      count:   (rows: any[]) => rows.length,
      revenue: (rows: any[]) => round(rows.reduce((s,r) => s + Number(r.amount ?? 0), 0)),
    },
  },
  membership_payments: {
    table: "membership_payments",
    select: "id,user_id,amount,status,tier,created_at",
    date_col: "created_at",
    dims: ["status","tier"],
    metrics: {
      count:   (rows: any[]) => rows.length,
      revenue: (rows: any[]) => round(rows.reduce((s,r) => s + Number(r.amount ?? 0), 0)),
    },
  },
  membership_changes: {
    table: "membership_changes",
    select: "id,user_id,previous_tier,new_tier,created_at",
    date_col: "created_at",
    dims: ["previous_tier","new_tier"],
    metrics: { count: (rows: any[]) => rows.length },
  },
  gift_cards: {
    table: "gift_cards",
    select: "id,recipient_email,amount,status,created_at",
    date_col: "created_at",
    dims: ["status"],
    metrics: {
      count:   (rows: any[]) => rows.length,
      revenue: (rows: any[]) => round(rows.reduce((s,r) => s + Number(r.amount ?? 0), 0)),
    },
  },
  deposit_transactions: {
    table: "deposit_transactions",
    select: "id,user_id,amount,transaction_type,created_at",
    date_col: "created_at",
    dims: ["transaction_type"],
    metrics: {
      count:   (rows: any[]) => rows.length,
      revenue: (rows: any[]) => round(rows.reduce((s,r) => s + Number(r.amount ?? 0), 0)),
    },
  },
  sgt_scorecards: {
    table: "sgt_scorecards",
    select: "id,sgt_user_id,tournament_id,gross_score,net_score,is_complete,created_at",
    date_col: "created_at",
    dims: ["tournament_id","is_complete"],
    metrics: {
      count:     (rows: any[]) => rows.length,
      avg_gross: (rows: any[]) => avg(rows.map((r:any) => Number(r.gross_score)).filter(Number.isFinite)),
      avg_net:   (rows: any[]) => avg(rows.map((r:any) => Number(r.net_score)).filter(Number.isFinite)),
    },
  },
  local_competitions: {
    table: "local_competitions",
    select: "id,name,date,status,created_at",
    date_col: "date",
    dims: ["status"],
    metrics: { count: (rows: any[]) => rows.length },
  },
};

function round(n: number) { return Math.round(n * 100) / 100; }
function avg(arr: number[]) { return arr.length ? round(arr.reduce((s,n) => s+n, 0) / arr.length) : 0; }

function toBrisbaneDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value + "T00:00:00+10:00");
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 10 * 3600 * 1000);
}
function bzFormat(d: Date, grain: string): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  if (grain === "day")   return `${y}-${m}-${day}`;
  if (grain === "month") return `${y}-${m}`;
  if (grain === "hour")  return `${y}-${m}-${day} ${h}:00`;
  if (grain === "dow")   return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getUTCDay()];
  if (grain === "week") {
    const dow = (d.getUTCDay() + 6) % 7;
    const monday = new Date(d.getTime() - dow * 86400000);
    return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth()+1).padStart(2,"0")}-${String(monday.getUTCDate()).padStart(2,"0")}`;
  }
  return `${y}-${m}-${day}`;
}

function toCsv(columns: string[], rows: any[]): string {
  const esc = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return columns.join(",") + "\n" + rows.map(r => columns.map(c => esc(r[c])).join(",")).join("\n");
}

async function runReport(args: any) {
  const ent = ENTITIES[args.entity];
  if (!ent) return { error: `unknown entity: ${args.entity}` };

  const today     = new Date(Date.now() + 10*3600*1000).toISOString().slice(0,10);
  const ninetyAgo = new Date(Date.now() - 90*86400000 + 10*3600*1000).toISOString().slice(0,10);
  const from = args.from_date || ninetyAgo;
  const to   = args.to_date   || today;

  let q = admin.from(ent.table).select(ent.select).gte(ent.date_col, from).lte(ent.date_col, to);

  const validCols = new Set(ent.select.split(",").map((c: string) => c.trim()));
  for (const f of (args.filters ?? [])) {
    if (!validCols.has(f.column)) return { error: `filter column not allowed: ${f.column}` };
    switch (f.op) {
      case "eq":    q = q.eq(f.column, f.value); break;
      case "neq":   q = q.neq(f.column, f.value); break;
      case "gte":   q = q.gte(f.column, f.value); break;
      case "lte":   q = q.lte(f.column, f.value); break;
      case "in":    q = q.in(f.column, Array.isArray(f.value) ? f.value : [f.value]); break;
      case "ilike": q = q.ilike(f.column, `%${f.value}%`); break;
      default: return { error: `unsupported op: ${f.op}` };
    }
  }

  const { data: rawRows, error } = await q.limit(10000);
  if (error) return { error: error.message };
  const source = rawRows ?? [];

  if (ent.is_contact_list && !args.group_by?.length && !args.group_by_date) {
    const limit = Math.min(args.limit ?? 1000, 5000);
    const cols = ["first_name","last_name","email","phone","membership_tier","custom_segment","deposit_balance","total_bookings","created_at"];
    const out = source.slice(0, limit).map((r: any) => Object.fromEntries(cols.map(c => [c, r[c]])));
    return { mode: "contacts", columns: cols, rows: out, total_rows: source.length, returned_rows: out.length, csv: toCsv(cols, out) };
  }

  const metrics: string[] = args.metrics?.length ? args.metrics : ["count"];
  for (const m of metrics) {
    if (!ent.metrics[m]) return { error: `metric not supported on ${args.entity}: ${m}` };
  }
  const dims: string[] = (args.group_by ?? []).filter((d: string) => ent.dims.includes(d));
  const dateGrain: string | null = args.group_by_date || null;

  const buckets = new Map<string, { keyParts: Record<string,any>, items: any[] }>();
  for (const r of source) {
    const keyParts: Record<string,any> = {};
    for (const d of dims) keyParts[d] = r[d];
    if (dateGrain) {
      const bz = toBrisbaneDate(r[ent.date_col]);
      keyParts[`period_${dateGrain}`] = bz ? bzFormat(bz, dateGrain) : null;
    }
    const key = JSON.stringify(keyParts);
    if (!buckets.has(key)) buckets.set(key, { keyParts, items: [] });
    buckets.get(key)!.items.push(r);
  }

  const rows = Array.from(buckets.values()).map(b => {
    const out: Record<string,any> = { ...b.keyParts };
    for (const m of metrics) out[m] = ent.metrics[m](b.items);
    return out;
  });

  const sortKey = args.order_by || metrics[0];
  const desc = args.order_desc ?? true;
  rows.sort((a,b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number") return desc ? bv - av : av - bv;
    return desc ? String(bv ?? "").localeCompare(String(av ?? "")) : String(av ?? "").localeCompare(String(bv ?? ""));
  });

  const limit = Math.min(args.limit ?? 100, 1000);
  const limited = rows.slice(0, limit);
  const columns = Object.keys(limited[0] ?? { ...Object.fromEntries(dims.map(d => [d,null])), ...Object.fromEntries(metrics.map(m => [m,null])) });

  return {
    mode: "aggregate",
    entity: args.entity,
    from_date: from,
    to_date: to,
    source_rows: source.length,
    columns,
    rows: limited,
    total_groups: rows.length,
    csv: toCsv(columns, limited),
  };
}


// ---------- Tool executors ----------
async function callEdgeFn(name: string, body: any, authHeader: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": authHeader,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch {}
  if (!res.ok) return { error: parsed?.error || parsed?.message || `edge fn ${name} failed (${res.status})`, status: res.status, detail: parsed };
  return parsed;
}

async function execTool(name: string, args: any, userId: string, threadId: string | null, authHeader: string) {
  const log = async (status: string, result: any) => {
    await admin.from("ai_caddy_actions").insert({
      thread_id: threadId, user_id: userId, tool_name: name, args, result, status,
    });
  };

  try {
    switch (name) {
      case "find_customer": {
        const q = String(args.query || "").trim();
        if (!q) return { error: "empty query" };
        const orFilter = `email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`;
        const { data, error } = await admin
          .from("profiles")
          .select("id,user_id,first_name,last_name,email,phone,membership_tier,deposit_balance,total_bookings,payment_failed_at,booking_flag_enabled")
          .or(orFilter)
          .limit(5);
        if (error) return { error: error.message };
        return { matches: data };
      }
      case "get_customer_bookings": {
        const limit = Math.min(args.limit ?? 20, 100);
        const { data, error } = await admin
          .from("bookings")
          .select("id,booking_date,start_time,end_time,bay_id,status,total_price,player_count,created_at,stripe_payment_intent_id")
          .eq("user_id", args.user_id)
          .order("booking_date", { ascending: false })
          .limit(limit);
        if (error) return { error: error.message };
        return { bookings: data };
      }
      case "get_booking": {
        const { data: b, error } = await admin
          .from("bookings")
          .select("*, bays(name), profiles!bookings_user_id_fkey(first_name,last_name,email,phone)")
          .eq("id", args.booking_id)
          .maybeSingle();
        if (error) return { error: error.message };
        return { booking: b };
      }
      case "get_recent_edge_logs": {
        const allowed = ["adhoc_sms_log","bay_controller_logs","deposit_transactions","membership_changes","membership_payments","local_hcp_adjustments"];
        if (!allowed.includes(args.table)) return { error: "table not allowed" };
        let q = admin.from(args.table).select("*").order("created_at", { ascending: false }).limit(Math.min(args.limit ?? 25, 100));
        if (args.filter_column && args.filter_value) q = q.eq(args.filter_column, args.filter_value);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return { rows: data };
      }
      case "get_stripe_events_for_customer": {
        const customers = await stripe.customers.list({ email: args.email, limit: 3 });
        if (!customers.data.length) return { error: "no stripe customer", email: args.email };
        const cid = customers.data[0].id;
        const [charges, refunds, subs] = await Promise.all([
          stripe.charges.list({ customer: cid, limit: 10 }),
          stripe.refunds.list({ limit: 10 }),
          stripe.subscriptions.list({ customer: cid, limit: 5 }),
        ]);
        return {
          customer_id: cid,
          charges: charges.data.map(c => ({ id: c.id, amount: c.amount/100, status: c.status, created: new Date(c.created*1000).toISOString(), description: c.description, refunded: c.refunded })),
          recent_refunds: refunds.data.filter(r => r.charge && charges.data.some(c => c.id === r.charge)).map(r => ({ id: r.id, amount: (r.amount||0)/100, status: r.status, reason: r.reason })),
          subscriptions: subs.data.map(s => ({ id: s.id, status: s.status, current_period_end: new Date(s.current_period_end*1000).toISOString() })),
        };
      }
      case "get_sgt_status": {
        const today = new Date().toISOString().slice(0,10);
        const { data: tours } = await admin.from("sgt_tours").select("*").gte("end_date", today).order("end_date", { ascending: true }).limit(1);
        const tour = tours?.[0];
        if (!tour) return { active_tour: null };
        const { data: tournaments } = await admin.from("sgt_tournaments").select("*").eq("tour_id", tour.id).order("created_at", { ascending: false }).limit(3);
        let registration = null, scorecard = null;
        if (args.user_id) {
          const { data: prof } = await admin.from("profiles").select("email").eq("user_id", args.user_id).maybeSingle();
          if (prof?.email) {
            const { data: member } = await admin.from("sgt_members").select("*").eq("email", prof.email.toLowerCase()).maybeSingle();
            if (member) {
              const { data: tm } = await admin.from("sgt_tour_members").select("*").eq("tour_id", tour.id).eq("user_id", member.sgt_user_id).maybeSingle();
              registration = tm;
              if (tournaments?.[0]) {
                const { data: sc } = await admin.from("sgt_scorecards").select("*").eq("tournament_id", tournaments[0].id).eq("sgt_user_id", member.sgt_user_id).maybeSingle();
                scorecard = sc;
              }
            }
          }
        }
        return { active_tour: tour, recent_tournaments: tournaments, registration, scorecard };
      }
      case "list_bays": {
        const { data, error } = await admin.from("bays").select("id,bay_number,name,is_active").order("bay_number", { ascending: true });
        if (error) return { error: error.message };
        return { bays: data };
      }
      case "refund_booking": {
        if (!args.confirmed) return { pending_confirmation: true, message: "Awaiting user confirmation. Re-invoke with confirmed=true after user agrees." };
        const result = await callEdgeFn("refund-booking", {
          booking_id: args.booking_id,
          send_notification: args.send_notification !== false,
        }, authHeader);
        await log(result?.error ? "error" : "success", { ...result, reason: args.reason });
        return result;
      }
      case "adjust_customer_credit": {
        if (!args.confirmed) return { pending_confirmation: true, message: "Awaiting user confirmation. Re-invoke with confirmed=true after user agrees." };
        const { data: prof } = await admin.from("profiles").select("user_id,deposit_balance").eq("user_id", args.user_id).maybeSingle();
        if (!prof) { const r = { error: "profile not found" }; await log("error", r); return r; }
        const before = Number(prof.deposit_balance || 0);
        const after = before + Number(args.amount);
        await admin.from("profiles").update({ deposit_balance: after }).eq("user_id", args.user_id);
        await admin.from("deposit_transactions").insert({
          user_id: args.user_id, amount: args.amount, balance_before: before, balance_after: after,
          transaction_type: "admin_adjustment", description: `AI Caddy: ${args.note}`,
        });
        const result = { ok: true, before, after, delta: args.amount };
        await log("success", result);
        return result;
      }
      case "create_booking": {
        if (!args.confirmed) return { pending_confirmation: true, message: "Awaiting user confirmation. Re-invoke with confirmed=true after user agrees." };
        const duration = Number(args.duration_hours);
        if (!duration || duration < 1 || duration > 4) { const r = { error: "duration_hours must be 1-4" }; await log("error", r); return r; }
        const [hh, mm] = String(args.start_time).split(":").map(Number);
        if (Number.isNaN(hh) || Number.isNaN(mm)) { const r = { error: "start_time must be HH:MM" }; await log("error", r); return r; }
        const endHh = hh + duration;
        const endTime = `${String(endHh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
        // Overlap check — mirror admin UI
        const { data: clash } = await admin.from("bookings")
          .select("id,start_time,end_time,status")
          .eq("bay_id", args.bay_id)
          .eq("booking_date", args.booking_date)
          .in("status", ["pending","confirmed"])
          .lt("start_time", endTime)
          .gt("end_time", args.start_time);
        if (clash && clash.length) { const r = { error: "Time slot overlaps existing booking", existing: clash }; await log("error", r); return r; }
        const hourlyRate = Number(args.hourly_rate ?? 35);
        const totalPrice = hourlyRate * duration;
        const { data: booking, error } = await admin.from("bookings").insert({
          user_id: args.user_id,
          bay_id: args.bay_id,
          booking_date: args.booking_date,
          start_time: args.start_time,
          end_time: endTime,
          duration_hours: duration,
          player_count: Number(args.player_count ?? 1),
          hourly_rate: hourlyRate,
          total_price: totalPrice,
          status: "confirmed",
          payment_method: "pending",
        }).select().single();
        if (error) { const r = { error: error.message }; await log("error", r); return r; }
        try {
          await callEdgeFn("send-booking-notification", { booking_id: booking.id, notification_type: "confirmation" }, authHeader);
        } catch (_) { /* don't fail booking on notify */ }
        const result = { ok: true, booking_id: booking.id, total_price: totalPrice, end_time: endTime };
        await log("success", result);
        return result;
      }
      case "update_customer": {
        if (!args.confirmed) return { pending_confirmation: true, message: "Awaiting user confirmation. Re-invoke with confirmed=true after user agrees." };
        const allowed = ["first_name","last_name","phone","custom_segment","booking_flag_enabled","membership_on_hold","custom_billing","custom_hourly_rate"];
        const patch: Record<string, any> = {};
        for (const k of allowed) if (args[k] !== undefined) patch[k] = args[k];
        if (!Object.keys(patch).length) { const r = { error: "no allowed fields provided" }; await log("error", r); return r; }
        const { data, error } = await admin.from("profiles").update(patch).eq("user_id", args.user_id).select("user_id,first_name,last_name,phone,custom_segment,booking_flag_enabled,membership_on_hold,custom_billing,custom_hourly_rate").maybeSingle();
        if (error) { const r = { error: error.message }; await log("error", r); return r; }
        const result = { ok: true, updated: patch, profile: data };
        await log("success", result);
        return result;
      }
      case "create_customer": {
        if (!args.confirmed) return { pending_confirmation: true, message: "Awaiting user confirmation. Re-invoke with confirmed=true after user agrees." };
        const result = await callEdgeFn("create-customer", {
          email: args.email, firstName: args.firstName, lastName: args.lastName, phone: args.phone,
        }, authHeader);
        await log(result?.error ? "error" : "success", result);
        return result;
      }
      case "cancel_membership": {
        if (!args.confirmed) return { pending_confirmation: true, message: "Awaiting user confirmation. Re-invoke with confirmed=true after user agrees." };
        const result = await callEdgeFn("cancel-membership", { user_id: args.user_id }, authHeader);
        await log(result?.error ? "error" : "success", result);
        return result;
      }
      case "run_report": {
        return await runReport(args);
      }
      default:
        return { error: "unknown tool" };
    }
  } catch (e: any) {
    const r = { error: e?.message ?? String(e) };
    await log("error", r);
    return r;
  }
}

function describeTiers(tiers: TierRow[]): string {
  if (!tiers.length) return "- No membership tiers or rates are configured yet in pricing_config.";
  return tiers
    .slice()
    .sort((a, b) => a.display_order - b.display_order)
    .map((t) => {
      const bits: string[] = [];
      if (t.is_subscription && t.weekly_subscription_price != null)
        bits.push(`$${Number(t.weekly_subscription_price).toFixed(2)}/wk`);
      bits.push(`peak $${Number(t.hourly_rate).toFixed(2)}/hr`);
      if (t.off_peak_hourly_rate != null) bits.push(`off-peak $${Number(t.off_peak_hourly_rate).toFixed(2)}/hr`);
      if (t.restricted_to_off_peak) bits.push("member rate applies off-peak only");
      if (t.single_bay_at_peak) bits.push("one bay at member rate during peak");
      if (t.grants_league_access) bits.push("league access");
      if (t.grants_range_access) bits.push("range access");
      if (t.is_default) bits.push("default walk-in tier");
      return `- **${t.display_name || t.tier}**: ${bits.join(", ")}.`;
    })
    .join("\n");
}

function buildSystemPrompt(tenant: TenantConfig, tiers: TierRow[]): string {
  const walkIn = tiers.find((t) => t.is_default);
  const walkInRate = walkIn ? `$${Number(walkIn.hourly_rate).toFixed(2)}/hr` : "the configured walk-in rate";
  return `You are AI Caddy, the in-admin assistant for ${tenant.venue_name} — an indoor golf simulator centre. You support the owner/staff with investigations, reporting, and a small set of safe actions.

# BUSINESS CONTEXT

## What the business is
- 6 indoor golf simulator bays (GSPro), self-serve outside staffed hours via gate access, staffed bar/POS during peak times.
- Two web surfaces share one database:
  - **${tenant.booking_domain}** — public booking, membership signup, marketing.
  - **${tenant.hub_domain}** — Member Hub: member dashboard, league (SGT), clubhouse social, in-bay ordering (QR), bay controller.
- Brisbane timezone (Australia/Brisbane, AEST/UTC+10, no DST) is used everywhere.

## Pricing & membership tiers (live from pricing_config)
${describeTiers(tiers)}
- Members get one bay at member rate where that tier is flagged; additional simultaneous bays are charged at the walk-in peak rate (${walkInRate}).
- Membership is billed weekly via Stripe. Payment failure → flagged, pushed to walk-in pricing until they retry. Second failure → downgraded to the walk-in tier.

## Bookings & operations
- Slots in 30-min increments, 1–4 hr bookings, open 8am–10pm.
- Off-peak window is Mon-Fri 5:30am-4:00pm and Sat-Sun 5:30am-10:00am; everything else (and public holidays) is peak.
- Staff are paid; "is it worth staffing X" usually means: does revenue/foot-traffic in that window justify wage cost? Answer with **bookings count + revenue + unique customers + bar/POS sales** for the specific day-of-week + hour window, ideally over the last 60–90 days.
- Bay Controller is an Electron app per bay that auto-launches GSPro at booking start and shuts down after. Logs in bay_controller_logs.

## Revenue streams (when reporting)
- **bookings** — bay rental revenue (total_price). Status 'confirmed' or 'completed' counts as real.
- **pos_transactions** — bar/cafe sales (food, drinks).
- **memberships** — recurring weekly subscription revenue.
- **gift_cards** — sold (purchased) vs redeemed. Redemptions are NOT new revenue, they're prepaid spend. Don't confuse the two.
- **deposit_transactions** — customer credit movements (promo credits, refunds-as-credit, gift card redemptions). Negative = spent, positive = added.

## SGT (Simulator Golf Tour) league
- Tournaments run Sunday → Monday (Brisbane). Monthly Winner = best player across a calendar month.
- Members register via the Hub; scores sync from SGT API every 4 hours.

# HOW TO ANSWER WELL

## Reasoning before tools
For business/strategic questions ("is it worth staffing X", "should we run a promo", "how is X performing"):
1. **Think about what data actually answers the question.** "Worth staffing Thursday before 4pm" needs: Thursday bookings 8am–4pm (count, revenue, unique customers) + Thursday POS revenue in that window. NOT gift cards, NOT memberships.
2. Pick the **smallest set of run_report calls** (usually 1–3) that gets those numbers.
3. Synthesise a real answer with a recommendation, not just numbers. E.g. "Thursday 12–4pm averages 0.8 bookings/day = $28 revenue. At $30+/hr wage, not worth a dedicated staff member — but if they're already on for the 4pm peak, arriving at 3pm covers prep + the occasional booking."
4. Show your working briefly so the owner can sanity-check.

## When to use which entity
- "How busy is X day/hour" → entity=bookings, filter by date/dow/hour, metric=count + sum(total_price).
- "Bar sales on X" → entity=pos_transactions.
- "Member growth / churn" → entity=memberships with status filter.
- "Marketing list" (export contacts to email) → entity=customer_contacts, NO group_by, filter the audience, confirm size in reply.
- "Gift card sales" → entity=gift_cards filter by status='purchased' (sold) vs 'redeemed' (spent).
- Default date window if user doesn't say: last 90 days. Don't go back to 2024 unless asked.

## run_report discipline
- ONE focused call per question dimension. If a call errors, READ the error and fix the args — don't blindly retry the same shape 10 times.
- If you've made 3 failed run_report attempts on the same question, stop and tell the user what's failing instead of looping.
- After it returns: summarise in 2–4 sentences with the actual numbers and an interpretation. Don't repaste the table (the UI shows it). Mention CSV download is available.

## General rules
- Always cite IDs (booking id, user id, stripe id) when investigating individual issues.
- DESTRUCTIVE tools (refund_booking, adjust_customer_credit, create_booking, update_customer, create_customer, cancel_membership): ALWAYS first call WITHOUT confirmed=true so the UI flags it; summarise exactly what will happen in plain English (who/what/when/$), wait for explicit user confirmation ("yes", "do it", "go ahead"), then re-call with confirmed=true.
- Prefer the dedicated action tools over telling the user to do it manually — they go through the same backend the admin UI uses (so notifications, Stripe, audit logs all fire correctly).
- When creating a booking: confirm bay (find via get_recent_edge_logs or ask), date, start time, duration, customer name + user_id, and hourly rate. Use ${walkInRate} (the walk-in rate) unless the user specifies.
- When updating a customer: only touch the field(s) explicitly requested. Never change email — that's not in the toolset.
- Never reveal secrets, env vars, or raw SQL. Never invent data — if you don't have it, say so.
- All times = Australia/Brisbane.
- Refuse politely if asked to delete customers, change membership tier directly, or do bulk ops — those aren't in your toolset.
- Keep replies tight. Markdown allowed. Lead with the answer, then the numbers.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "no auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Role/segment check
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    let allowed = isAdmin === true;
    if (!allowed) {
      const { data: prof } = await admin.from("profiles").select("custom_segment").eq("user_id", user.id).maybeSingle();
      allowed = prof?.custom_segment === "staff";
    }
    if (!allowed) return new Response(JSON.stringify({ error: "not authorized" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { messages, thread_id } = await req.json();
    if (!Array.isArray(messages)) return new Response(JSON.stringify({ error: "messages required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const tenant = await getTenant();

    // Tool-call loop
    const convo: any[] = [{ role: "system", content: buildSystemPrompt(tenant, await loadTiers(admin)) }, ...messages];
    const toolCallsTrace: any[] = [];
    const MAX_STEPS = 25;
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": LOVABLE_API_KEY,
          "X-Lovable-AIG-SDK": "direct-fetch",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: convo,
          tools,
          tool_choice: "auto",
        }),
      });
      if (res.status === 429) return new Response(JSON.stringify({ error: "rate_limited", message: "AI rate limit hit — wait a moment and try again." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (res.status === 402) return new Response(JSON.stringify({ error: "credits_exhausted", message: "AI credits exhausted. Add credits in Workspace settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (!res.ok) {
        const txt = await res.text();
        return new Response(JSON.stringify({ error: "gateway_error", status: res.status, detail: txt, assistant: `⚠️ AI gateway error (${res.status}). ${txt.slice(0, 200)}`, tool_calls: toolCallsTrace }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) return new Response(JSON.stringify({ assistant: "⚠️ No response from AI. Try again.", tool_calls: toolCallsTrace }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      convo.push(msg);

      if (msg.tool_calls && msg.tool_calls.length) {
        for (const tc of msg.tool_calls) {
          let parsedArgs: any = {};
          try { parsedArgs = JSON.parse(tc.function.arguments || "{}"); } catch {}
          const result = await execTool(tc.function.name, parsedArgs, user.id, thread_id ?? null, authHeader);
          toolCallsTrace.push({ id: tc.id, name: tc.function.name, args: parsedArgs, result });
          convo.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        continue;
      }
      // Final assistant text
      return new Response(JSON.stringify({
        assistant: msg.content ?? "",
        tool_calls: toolCallsTrace,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Max steps — return partial with explanation so the UI still renders the tool trace
    return new Response(JSON.stringify({
      assistant: `⚠️ I ran ${MAX_STEPS} tool calls without reaching a final answer — likely got stuck looping. Try narrowing the question (e.g. "bookings on Thursdays between 12pm and 4pm over the last 90 days") or ask me to look at one specific date.`,
      tool_calls: toolCallsTrace,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[ai-caddy] error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
