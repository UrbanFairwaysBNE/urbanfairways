import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PackProduct {
  id: string;
  name: string;
  hours: number;
  price: number;
  validity_days: number;
  description: string | null;
  is_active: boolean;
  display_order: number;
  is_corporate: boolean;
}

export interface PackLot {
  id: string;
  product_name: string;
  hours_total: number;
  hours_remaining: number;
  expires_at: string | null;
  status: string;
  is_gift: boolean;
  redemption_code: string | null;
  recipient_name: string | null;
  purchased_at: string | null;
}

export interface PackTransaction {
  id: string;
  hours: number;
  balance_after: number;
  transaction_type: string;
  description: string | null;
  created_at: string;
}

/** Rounds to the nearest 0.25hr to avoid floating point noise in the ledger. */
export const roundHours = (h: number) => Math.round(h * 4) / 4;

export const formatHours = (h: number) => {
  const rounded = roundHours(h);
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(2).replace(/0$/, "");
};

/**
 * Prepaid hours wallet — completely separate from the dollar credit balance.
 * Hours pay for simulator time only and are spent oldest-expiry-first server side.
 */
export function usePackHours(userId?: string | null) {
  const [balance, setBalance] = useState(0);
  const [lots, setLots] = useState<PackLot[]>([]);
  const [products, setProducts] = useState<PackProduct[]>([]);
  const [transactions, setTransactions] = useState<PackTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [corporate, setCorporate] = useState<{
    companyName: string;
    isOwner: boolean;
  } | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = userId ?? auth.user?.id ?? null;

      // Corporate accounts see corporate packs only; everyone else sees retail packs
      let isCorpOwner = false;
      let isCorpStaff = false;
      if (uid) {
        const { data: accounts } = await supabase
          .from("corporate_accounts")
          .select("owner_user_id, company_name")
          .eq("is_active", true)
          .limit(1);
        const acc = accounts?.[0];
        if (acc) {
          isCorpOwner = acc.owner_user_id === uid;
          isCorpStaff = !isCorpOwner;
          setCorporate({ companyName: acc.company_name, isOwner: isCorpOwner });
        } else {
          setCorporate(null);
        }
      }

      const productsRes = await supabase
        .from("pack_products")
        .select(
          "id, name, hours, price, validity_days, description, is_active, display_order, is_corporate",
        )
        .eq("is_active", true)
        .eq("is_corporate", isCorpOwner)
        .order("display_order");

      // Staff can spend the company wallet but never buy packs themselves
      setProducts(isCorpStaff ? [] : ((productsRes.data ?? []) as PackProduct[]));

      if (!uid) {
        setBalance(0);
        setLots([]);
        setTransactions([]);
        return;
      }


      const [balanceRes, lotsRes, txRes] = await Promise.all([
        supabase.rpc("pack_hours_balance", { _user_id: uid }),
        supabase
          .from("pack_lots")
          .select(
            "id, product_name, hours_total, hours_remaining, expires_at, status, is_gift, redemption_code, recipient_name, purchased_at",
          )
          .or(`user_id.eq.${uid},purchaser_user_id.eq.${uid}`)
          .neq("status", "pending_payment")
          .order("created_at", { ascending: false }),
        supabase
          .from("pack_transactions")
          .select("id, hours, balance_after, transaction_type, description, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(25),
      ]);

      setBalance(Number(balanceRes.data) || 0);
      setLots((lotsRes.data ?? []) as PackLot[]);
      setTransactions((txRes.data ?? []) as PackTransaction[]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const purchase = async (productId: string, opts?: { isGift?: boolean; recipientName?: string }) => {
    const { data, error } = await supabase.functions.invoke("create-pack-checkout", {
      body: {
        product_id: productId,
        is_gift: opts?.isGift ?? false,
        recipient_name: opts?.recipientName ?? null,
      },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data.url as string;
  };

  const redeemCode = async (code: string) => {
    const { data, error } = await supabase.rpc("redeem_pack_code", { _code: code.trim() });
    if (error) throw new Error(error.message);
    const result = data as { success: boolean; error?: string; hours?: number };
    if (!result?.success) throw new Error(result?.error || "Could not redeem that code");
    await refresh();
    return result.hours ?? 0;
  };

  return { balance, lots, products, transactions, isLoading, refresh, purchase, redeemCode };
}
