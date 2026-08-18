import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Nicknames live on `sgt_tour_members.nickname` and are the venue-facing
 * display name for a player. Wherever an SGT username is shown on a
 * leaderboard, embed or TV board, it must be swapped for the nickname when
 * one exists. Matching is on the lowercased SGT username.
 */
export function useSgtNicknames() {
  const { data } = useQuery({
    queryKey: ["sgt-nicknames"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tour_members")
        .select("user_id, user_name, nickname")
        .not("nickname", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const byName = new Map<string, string>();
  const byId = new Map<number, string>();
  for (const row of data ?? []) {
    const nickname = (row.nickname || "").trim();
    if (!nickname) continue;
    if (row.user_name) byName.set(row.user_name.trim().toLowerCase(), nickname);
    if (row.user_id != null) byId.set(row.user_id, nickname);
  }

  /** Returns the nickname for an SGT username, or the username unchanged. */
  const nick = (playerName?: string | null): string => {
    const raw = (playerName || "").trim();
    if (!raw) return raw;
    return byName.get(raw.toLowerCase()) ?? raw;
  };

  /** Returns the nickname for an SGT user id, falling back to the name. */
  const nickById = (userId?: number | null, fallback?: string | null): string => {
    if (userId != null && byId.has(userId)) return byId.get(userId) as string;
    return nick(fallback);
  };

  return { nick, nickById, hasNicknames: byName.size > 0 };
}

export default useSgtNicknames;
