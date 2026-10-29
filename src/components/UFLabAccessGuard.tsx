import { ReactNode, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePricing } from "@/hooks/usePricing";

/** True when the account may open UF Lab: range-access tier, coach, staff or admin. */
export function canAccessUFLab(opts: {
  tierGrantsRange: boolean;
  isCoach: boolean;
  isStaff: boolean;
  isAdmin: boolean;
}): boolean {
  return opts.tierGrantsRange || opts.isCoach || opts.isStaff || opts.isAdmin;
}

export default function UFLabAccessGuard({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { hasRangeAccess, isLoading: pricingLoading } = usePricing();
  const [state, setState] = useState<{ loaded: boolean; tier: string | null; isCoach: boolean; isStaff: boolean; isAdmin: boolean }>({
    loaded: false, tier: null, isCoach: false, isStaff: false, isAdmin: false,
  });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [p, a] = await Promise.all([
        supabase.from("profiles").select("membership_tier, custom_segment, is_coach").eq("user_id", user.id).maybeSingle(),
        supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }),
      ]);
      if (cancelled) return;
      const prof = p.data as any;
      setState({
        loaded: true,
        tier: prof?.membership_tier ?? "casual",
        isCoach: !!prof?.is_coach,
        isStaff: prof?.custom_segment === "staff",
        isAdmin: !!a.data,
      });
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Let the page handle its own sign-in redirect.
  if (isLoading || !isAuthenticated) return <>{children}</>;
  if (!state.loaded || pricingLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  const allowed = canAccessUFLab({
    tierGrantsRange: hasRangeAccess(state.tier),
    isCoach: state.isCoach,
    isStaff: state.isStaff,
    isAdmin: state.isAdmin,
  });
  if (!allowed) return <Navigate to="/membership" replace />;
  return <>{children}</>;
}
