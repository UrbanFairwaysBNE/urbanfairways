import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CorporateAccount {
  id: string;
  owner_user_id: string;
  company_name: string;
  is_active: boolean;
}

export interface CorporateStaffRow {
  id: string;
  corporate_id: string;
  email: string;
  user_id: string | null;
  monthly_hour_cap: number | null;
  status: string;
  created_at: string;
  /** Hours drawn from the company wallet this calendar month (owner view only). */
  hoursThisMonth?: number;
}

/**
 * Corporate accounts let a company prepay for simulator time and share the
 * balance with named staff. The wallet itself lives on the owner's pack lots —
 * `pack_wallet_owner()` server side routes every staff booking to it.
 */
export function useCorporate() {
  const [account, setAccount] = useState<CorporateAccount | null>(null);
  const [staff, setStaff] = useState<CorporateStaffRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      setUserId(uid);

      if (!uid) {
        setAccount(null);
        setStaff([]);
        return;
      }

      // RLS only ever returns the account this user owns or belongs to
      const { data: accounts } = await supabase
        .from("corporate_accounts")
        .select("id, owner_user_id, company_name, is_active")
        .eq("is_active", true)
        .limit(1);

      const acc = (accounts?.[0] ?? null) as CorporateAccount | null;
      setAccount(acc);

      if (!acc) {
        setStaff([]);
        return;
      }

      const { data: rows } = await supabase
        .from("corporate_staff")
        .select("id, corporate_id, email, user_id, monthly_hour_cap, status, created_at")
        .eq("corporate_id", acc.id)
        .eq("status", "active")
        .order("created_at");

      let staffRows = (rows ?? []) as CorporateStaffRow[];

      // Owners get per-staff usage for the current month
      if (acc.owner_user_id === uid && staffRows.length > 0) {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const { data: lotRows } = await supabase
          .from("pack_lots")
          .select("id")
          .eq("user_id", uid);
        const lotIds = (lotRows ?? []).map((l) => l.id);

        if (lotIds.length > 0) {
          const { data: tx } = await supabase
            .from("pack_transactions")
            .select("user_id, hours, lot_id")
            .in("lot_id", lotIds)
            .lt("hours", 0)
            .gte("created_at", monthStart.toISOString());

          const used = new Map<string, number>();
          (tx ?? []).forEach((t) => {
            if (!t.user_id) return;
            used.set(t.user_id, (used.get(t.user_id) ?? 0) + Math.abs(Number(t.hours)));
          });
          staffRows = staffRows.map((s) => ({
            ...s,
            hoursThisMonth: s.user_id ? (used.get(s.user_id) ?? 0) : 0,
          }));
        }
      }

      setStaff(staffRows);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isOwner = !!account && !!userId && account.owner_user_id === userId;
  const isStaff = !!account && !isOwner;

  const addStaff = async (email: string, monthlyCap?: number | null) => {
    if (!account) throw new Error("No corporate account");
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("Enter a valid email address");

    const { error } = await supabase.from("corporate_staff").insert({
      corporate_id: account.id,
      email: clean,
      monthly_hour_cap: monthlyCap ?? null,
    });
    if (error) {
      if (error.code === "23505") {
        throw new Error("That email already has access to a company account");
      }
      throw new Error(error.message);
    }

    // Link immediately if they already have an account
    const { data: existing } = await supabase
      .from("profiles")
      .select("user_id")
      .ilike("email", clean)
      .maybeSingle();
    if (existing?.user_id) {
      await supabase
        .from("corporate_staff")
        .update({ user_id: existing.user_id })
        .eq("corporate_id", account.id)
        .eq("email", clean);
    }

    // Invite email so the staff member knows they have access (non-blocking)
    supabase.functions
      .invoke("send-corporate-staff-invite", { body: { staff_email: clean } })
      .catch(() => undefined);

    await refresh();
  };

  const removeStaff = async (id: string) => {
    const { error } = await supabase
      .from("corporate_staff")
      .update({ status: "revoked", user_id: null })
      .eq("id", id);
    if (error) throw new Error(error.message);
    await refresh();
  };

  const setCap = async (id: string, cap: number | null) => {
    const { error } = await supabase
      .from("corporate_staff")
      .update({ monthly_hour_cap: cap })
      .eq("id", id);
    if (error) throw new Error(error.message);
    await refresh();
  };

  return { account, staff, isOwner, isStaff, isLoading, refresh, addStaff, removeStaff, setCap };
}
