import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  UserPlus,
  UserMinus,
  Pause,
  Search,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { format, subDays, parseISO } from "date-fns";
import { usePricing } from "@/hooks/usePricing";
import { memberTierKeys, tierBadgeClass } from "@/lib/tier-config";

interface MemberProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  membership_tier: string;
  membership_on_hold: boolean;
  payment_failed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MembershipChange {
  id: string;
  user_id: string;
  previous_tier: string;
  new_tier: string;
  changed_at: string;
}

type StatusFilter = "all" | "active" | "on_hold" | "payment_failed";
type SortField = "name" | "email" | "tier" | "status" | "created_at";
type SortDirection = "asc" | "desc";


export function MembersSection() {
  const { pricing, defaultTier, memberTiers } = usePricing();
  // Tier keys are venue-defined; the walk-in tier comes from pricing config.
  const walkInTier = defaultTier?.tier ?? "casual";
  const MEMBER_TIERS = memberTierKeys(pricing);
  const getTierColor = (tier: string) => tierBadgeClass(pricing, tier);
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Weekly changes from the audit table
  const [weeklyNetNew, setWeeklyNetNew] = useState<(MembershipChange & { first_name?: string; last_name?: string })[]>([]);
  const [weeklyReturning, setWeeklyReturning] = useState<(MembershipChange & { first_name?: string; last_name?: string })[]>([]);
  const [weeklyDropoffs, setWeeklyDropoffs] = useState<(MembershipChange & { first_name?: string; last_name?: string })[]>([]);

  useEffect(() => {
    fetchMembers();
    fetchWeeklyChanges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricing]);

  const fetchMembers = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, first_name, last_name, email, phone, membership_tier, membership_on_hold, payment_failed_at, created_at, updated_at")
      .neq("membership_tier", walkInTier)
      .order("last_name");

    if (!error && data) {
      setMembers(data as MemberProfile[]);
    }
    setIsLoading(false);
  };

  const fetchWeeklyChanges = async () => {
    const weekAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");

    // Fetch all tier changes from the last 7 days
    const { data: changes } = await supabase
      .from("membership_changes")
      .select("*")
      .gte("changed_at", weekAgo)
      .order("changed_at", { ascending: false });

    if (!changes || changes.length === 0) {
      setWeeklyNetNew([]);
      setWeeklyReturning([]);
      setWeeklyDropoffs([]);
      return;
    }

    // Get profile names for all user_ids in the changes
    const userIds = [...new Set(changes.map((c: MembershipChange) => c.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name")
      .in("user_id", userIds);

    const nameMap = new Map<string, { first_name: string; last_name: string }>();
    if (profiles) {
      for (const p of profiles) {
        nameMap.set(p.user_id, { first_name: p.first_name, last_name: p.last_name });
      }
    }

    const enriched = changes.map((c: MembershipChange) => ({
      ...c,
      first_name: nameMap.get(c.user_id)?.first_name || "",
      last_name: nameMap.get(c.user_id)?.last_name || "",
    }));

    // Joins: visitor -> member tier
    const joins = enriched.filter(
      (c) => c.previous_tier === walkInTier && MEMBER_TIERS.includes(c.new_tier)
    );

    // Dropoffs: member tier -> visitor
    const dropoffs = enriched.filter(
      (c) => MEMBER_TIERS.includes(c.previous_tier) && c.new_tier === walkInTier
    );

    // Determine net-new vs returning: check if any PRIOR member->visitor record exists (before this week)
    const joinUserIds = [...new Set(joins.map((j) => j.user_id))];
    let previousMemberIds = new Set<string>();
    if (joinUserIds.length > 0) {
      const { data: priorChanges } = await supabase
        .from("membership_changes")
        .select("user_id")
        .in("user_id", joinUserIds)
        .in("previous_tier", MEMBER_TIERS)
        .eq("new_tier", walkInTier)
        .lt("changed_at", weekAgo);
      if (priorChanges) {
        previousMemberIds = new Set(priorChanges.map((c) => c.user_id));
      }
      // Also check for same-week churn+rejoin (dropoff in same week = returning)
      const sameWeekChurnIds = new Set(dropoffs.map((d) => d.user_id));
      for (const id of sameWeekChurnIds) {
        previousMemberIds.add(id);
      }
    }

    const netNew = joins.filter((j) => !previousMemberIds.has(j.user_id));
    const returning = joins.filter((j) => previousMemberIds.has(j.user_id));

    // Exclude from "lost" anyone who re-joined this week
    const rejoinedUserIds = new Set(joins.map((j) => j.user_id));
    const actualDropoffs = dropoffs.filter((d) => !rejoinedUserIds.has(d.user_id));

    setWeeklyNetNew(netNew);
    setWeeklyReturning(returning);
    setWeeklyDropoffs(actualDropoffs);
  };

  const onHoldMembers = useMemo(
    () => members.filter((m) => m.membership_on_hold),
    [members]
  );

  const activeMembers = useMemo(
    () => members.filter((m) => !m.membership_on_hold && !m.payment_failed_at),
    [members]
  );

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "created_at" ? "desc" : "asc");
    }
  };

  const getMemberStatus = (m: MemberProfile) =>
    m.payment_failed_at ? "payment_failed" : m.membership_on_hold ? "on_hold" : "active";

  // Filtered & sorted list
  const filteredMembers = useMemo(() => {
    const filtered = members.filter((m) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const fullName = `${m.first_name} ${m.last_name}`.toLowerCase();
        if (
          !fullName.includes(q) &&
          !m.email?.toLowerCase().includes(q) &&
          !m.phone?.includes(q)
        )
          return false;
      }
      if (tierFilter !== "all" && m.membership_tier !== tierFilter) return false;
      if (statusFilter === "active" && (m.membership_on_hold || m.payment_failed_at))
        return false;
      if (statusFilter === "on_hold" && !m.membership_on_hold) return false;
      if (statusFilter === "payment_failed" && !m.payment_failed_at) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
          break;
        case "email":
          cmp = (a.email || "").localeCompare(b.email || "");
          break;
        case "tier":
          cmp = MEMBER_TIERS.indexOf(a.membership_tier) - MEMBER_TIERS.indexOf(b.membership_tier);
          break;
        case "status":
          cmp = getMemberStatus(a).localeCompare(getMemberStatus(b));
          break;
        case "created_at":
          cmp = a.created_at.localeCompare(b.created_at);
          break;
      }
      return sortDirection === "desc" ? -cmp : cmp;
    });
  }, [members, searchQuery, tierFilter, statusFilter, sortField, sortDirection]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4" />
              Active Members
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight">{activeMembers.length}</p>
          </CardContent>
        </Card>
        <Card className={weeklyNetNew.length > 0 ? "border-emerald-200 dark:border-emerald-800" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <UserPlus className="h-4 w-4" />
              Net New
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight">{weeklyNetNew.length}</p>
            {weeklyReturning.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                +{weeklyReturning.length} returning
              </p>
            )}
          </CardContent>
        </Card>
        <Card className={weeklyDropoffs.length > 0 ? "border-destructive/50" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <UserMinus className="h-4 w-4" />
              Lost This Week
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight">{weeklyDropoffs.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Pause className="h-4 w-4" />
              On Hold
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight">{onHoldMembers.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Activity Feed */}
      {(weeklyNetNew.length > 0 || weeklyReturning.length > 0 || weeklyDropoffs.length > 0) && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              This Week's Changes
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {weeklyNetNew.map((c) => (
                <div
                  key={`new-${c.id}`}
                  className="flex items-center gap-3 text-sm py-1.5 px-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30"
                >
                  <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="font-medium">
                    {c.first_name} {c.last_name}
                  </span>
                  <Badge variant="outline" className={getTierColor(c.new_tier)}>
                    {c.new_tier}
                  </Badge>
                  <span className="text-muted-foreground ml-auto text-xs">
                    New {format(parseISO(c.changed_at), "EEE d MMM")}
                  </span>
                </div>
              ))}
              {weeklyReturning.map((c) => (
                <div
                  key={`ret-${c.id}`}
                  className="flex items-center gap-3 text-sm py-1.5 px-2 rounded-md bg-blue-50 dark:bg-blue-950/30"
                >
                  <TrendingUp className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="font-medium">
                    {c.first_name} {c.last_name}
                  </span>
                  <Badge variant="outline" className={getTierColor(c.new_tier)}>
                    {c.new_tier}
                  </Badge>
                  <span className="text-muted-foreground ml-auto text-xs">
                    Returned {format(parseISO(c.changed_at), "EEE d MMM")}
                  </span>
                </div>
              ))}
              {weeklyDropoffs.map((c) => (
                <div
                  key={`drop-${c.id}`}
                  className="flex items-center gap-3 text-sm py-1.5 px-2 rounded-md bg-destructive/5"
                >
                  <TrendingDown className="h-4 w-4 text-destructive shrink-0" />
                  <span className="font-medium">
                    {c.first_name} {c.last_name}
                  </span>
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                    was {c.previous_tier}
                  </Badge>
                  <span className="text-muted-foreground ml-auto text-xs">
                    {format(parseISO(c.changed_at), "EEE d MMM")}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            {memberTiers.map((t) => (
              <SelectItem key={t.tier} value={t.tier}>{t.display_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            <SelectItem value="payment_failed">Payment Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Members Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              {([["name", "Name"], ["email", "Email"], ["tier", "Tier"], ["status", "Status"], ["created_at", "Member Since"]] as [SortField, string][]).map(([field, label]) => (
                <TableHead
                  key={field}
                  className="cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => toggleSort(field)}
                >
                  <span className="inline-flex items-center gap-1">
                    {label}
                    {sortField === field ? (
                      sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No members found
                </TableCell>
              </TableRow>
            ) : (
              filteredMembers.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    {m.first_name} {m.last_name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getTierColor(m.membership_tier)}>
                      {m.membership_tier}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {m.payment_failed_at ? (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Payment Failed
                      </Badge>
                    ) : m.membership_on_hold ? (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-200 gap-1">
                        <Pause className="h-3 w-3" />
                        On Hold
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-200">
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(parseISO(m.created_at), "d MMM yyyy")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filteredMembers.length} of {members.length} members
      </p>
    </div>
  );
}
