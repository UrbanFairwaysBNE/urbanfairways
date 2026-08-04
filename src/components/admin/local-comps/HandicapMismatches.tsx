import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { useTenant } from "@/config/tenant";

/** Flag any player whose Ambrose handicap differs from their league handicap by this much or more. */
const GAP_THRESHOLD = 4;

const norm = (s: string) => (s || "").trim().toLowerCase();

interface MismatchRow {
  name: string;
  ambroseHcp: number;
  leagueHcp: number;
  leagueName: string;
  gap: number;
}

/**
 * League vs Ambrose handicap gaps.
 * The two handicaps are deliberately NOT synced (league recalc and Ambrose
 * weekly adjustments both move them), so this is a read-only watch list.
 */
export function HandicapMismatches() {
  const { tenant } = useTenant();
  const [open, setOpen] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["ambrose-league-hcp-mismatches"],
    queryFn: async (): Promise<MismatchRow[]> => {
      const [{ data: players }, { data: members }, { data: profiles }] = await Promise.all([
        supabase.from("local_comp_players").select("name, name_normalized, handicap"),
        supabase.from("sgt_tour_members").select("user_id, user_name, hcp_index, custom_hcp"),
        supabase.from("profiles").select("sgt_user_id, display_name, first_name, last_name").not("sgt_user_id", "is", null),
      ]);

      // league handicap per SGT user id
      const leagueHcp = new Map<number, { hcp: number; name: string }>();
      for (const m of members ?? []) {
        const hcp = m.custom_hcp ?? m.hcp_index;
        if (hcp === null || hcp === undefined) continue;
        if (!leagueHcp.has(m.user_id)) {
          leagueHcp.set(m.user_id, { hcp: Number(hcp), name: m.user_name || String(m.user_id) });
        }
      }

      // name (normalized) -> league handicap, via SGT gamertag and profile names
      const byName = new Map<string, { hcp: number; name: string }>();
      for (const [, v] of leagueHcp) byName.set(norm(v.name), v);
      for (const p of profiles ?? []) {
        const entry = leagueHcp.get(p.sgt_user_id as number);
        if (!entry) continue;
        const candidates = [
          p.display_name,
          [p.first_name, p.last_name].filter(Boolean).join(" "),
        ].filter(Boolean) as string[];
        for (const c of candidates) if (norm(c)) byName.set(norm(c), entry);
      }

      const out: MismatchRow[] = [];
      for (const p of players ?? []) {
        const key = p.name_normalized || norm(p.name);
        const league = byName.get(key);
        if (!league) continue;
        const ambroseHcp = Number(p.handicap) || 0;
        const gap = Math.abs(ambroseHcp - league.hcp);
        if (gap >= GAP_THRESHOLD) {
          out.push({
            name: p.name,
            ambroseHcp,
            leagueHcp: league.hcp,
            leagueName: league.name,
            gap: Math.round(gap * 10) / 10,
          });
        }
      }

      return out.sort((a, b) => b.gap - a.gap);
    },
  });

  const count = useMemo(() => rows.length, [rows]);

  return (
    <Card className={count > 0 ? "border-amber-400/60" : undefined}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="flex flex-row items-center justify-between cursor-pointer hover:bg-muted/40 transition-colors">
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className={count > 0 ? "h-5 w-5 text-amber-500" : "h-5 w-5 text-muted-foreground"} />
              Handicap Gaps (League vs Ambrose)
              <Badge variant={count > 0 ? "default" : "secondary"}>{count}</Badge>
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Players whose Ambrose handicap differs from their {tenant.venue_name} League handicap by{" "}
              {GAP_THRESHOLD} shots or more. The two are intentionally kept separate — this is a
              watch list only, nothing syncs automatically.
            </p>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : count === 0 ? (
              <p className="text-sm text-muted-foreground">
                No big gaps — every matched player is within {GAP_THRESHOLD} shots.
              </p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead className="text-center">Ambrose HCP</TableHead>
                      <TableHead className="text-center">League HCP</TableHead>
                      <TableHead className="text-center">Gap</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.name}>
                        <TableCell>
                          <p className="font-medium">{r.name}</p>
                          <p className="text-xs text-muted-foreground">SGT: {r.leagueName}</p>
                        </TableCell>
                        <TableCell className="text-center">{r.ambroseHcp.toFixed(1)}</TableCell>
                        <TableCell className="text-center">{r.leagueHcp.toFixed(1)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={r.gap >= GAP_THRESHOLD * 2 ? "destructive" : "secondary"}>
                            {r.gap.toFixed(1)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
