import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useTenant } from "@/config/tenant";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  Search,
  Pencil,
  Check,
  X,
  Loader2,
  Info,
  Lock,
  MoreHorizontal,
  Tag,
  UserMinus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LeagueMember {
  user_id: number;
  user_name: string | null;
  email: string | null;
  hcp_index: number | null;
  custom_hcp: number | null;
  onboarding_hcp: number | null;
  nickname: string | null;
  rounds_played: number;
}

const ROUNDS_REQUIRED = 3;
const BEST_ROUNDS = 3;
const WINDOW_ROUNDS = 6;

export function SGTLeagueMembers() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [editHandicapValue, setEditHandicapValue] = useState<string>("");
  const [nicknameMember, setNicknameMember] = useState<LeagueMember | null>(null);
  const [editNicknameValue, setEditNicknameValue] = useState<string>("");
  const [removeMember, setRemoveMember] = useState<LeagueMember | null>(null);

  // Global handicap settings
  const { data: settings } = useQuery({
    queryKey: ["sgt-handicap-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_handicap_settings")
        .select("*")
        .eq("id", "global")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const useCustomEnabled = settings?.use_custom_hcp ?? false;

  const toggleSettingMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("sgt_handicap_settings")
        .update({ use_custom_hcp: enabled, updated_at: new Date().toISOString() })
        .eq("id", "global");
      if (error) throw error;
      return enabled;
    },
    onSuccess: (enabled) => {
      queryClient.invalidateQueries({ queryKey: ["sgt-handicap-settings"] });
      toast({
        title: enabled ? "Custom HCP enabled" : "SGT HCP enabled",
        description: enabled
          ? `Players will use ${tenant.venue_name} custom handicap (best 3 of last 6 rounds).`
          : "Players will use SGT's Combo HCP. Onboarding lock is bypassed.",
      });
    },
  });

  const { data: members, isLoading } = useQuery({
    queryKey: ["sgt-league-members"],
    queryFn: async () => {
      const { data: tourMembers, error: tmError } = await supabase
        .from("sgt_tour_members")
        .select("user_id, user_name, hcp_index, custom_hcp, onboarding_hcp, nickname");

      if (tmError) throw tmError;

      const { data: profiles } = await supabase
        .from("profiles")
        .select("sgt_user_id, email")
        .not("sgt_user_id", "is", null);

      const sgtIdToEmail = new Map(
        (profiles || []).map(p => [p.sgt_user_id, p.email])
      );

      const { data: scorecards } = await supabase
        .from("sgt_scorecards")
        .select("player_id, total_gross")
        .not("total_gross", "is", null);

      const roundCounts = new Map<number, number>();
      (scorecards || []).forEach(sc => {
        roundCounts.set(sc.player_id, (roundCounts.get(sc.player_id) || 0) + 1);
      });

      const memberMap = new Map<number, LeagueMember>();
      (tourMembers || []).forEach(tm => {
        if (!memberMap.has(tm.user_id)) {
          memberMap.set(tm.user_id, {
            user_id: tm.user_id,
            user_name: tm.user_name,
            email: sgtIdToEmail.get(tm.user_id) || null,
            hcp_index: tm.hcp_index,
            custom_hcp: tm.custom_hcp,
            onboarding_hcp: tm.onboarding_hcp,
            nickname: tm.nickname ?? null,
            rounds_played: roundCounts.get(tm.user_id) || 0,
          });
        }
      });

      return Array.from(memberMap.values()).sort((a, b) =>
        (a.user_name || "").localeCompare(b.user_name || "")
      );
    },
  });

  const updateHcpMutation = useMutation({
    mutationFn: async ({ userId, customHcp }: { userId: number; customHcp: number | null }) => {
      const { error } = await supabase
        .from("sgt_tour_members")
        .update({
          custom_hcp: customHcp,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (error) throw error;
      return { userId, customHcp };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["sgt-league-members"] });
      // Re-register on SGT so the new handicap applies to open tournaments.
      // Fire-and-forget: SGT calls are slow and the UI shouldn't block on them.
      supabase.functions
        .invoke("sgt-auto-register", { body: { sgt_user_id: data.userId } })
        .catch((e) => console.error("[SGT] re-register failed", e));
      setEditingMemberId(null);
      setEditHandicapValue("");
      toast({
        title: "Handicap updated",
        description: (data.customHcp !== null
          ? `Custom handicap set to ${data.customHcp.toFixed(1)}`
          : "Custom handicap cleared") + " — re-registering on SGT in the background.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update handicap",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const updateNicknameMutation = useMutation({
    mutationFn: async ({ userId, nickname }: { userId: number; nickname: string | null }) => {
      const { error } = await supabase
        .from("sgt_tour_members")
        .update({ nickname, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) throw error;
      return { userId, nickname };
    },
    onSuccess: ({ nickname }) => {
      queryClient.invalidateQueries({ queryKey: ["sgt-league-members"] });
      queryClient.invalidateQueries({ queryKey: ["sgt-nicknames"] });
      setNicknameMember(null);
      setEditNicknameValue("");
      toast({
        title: nickname ? "Nickname saved" : "Nickname cleared",
        description: nickname
          ? `Leaderboards will show "${nickname}".`
          : "Leaderboards will show the SGT username.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to save nickname",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleSaveNickname = (userId: number) => {
    const value = editNicknameValue.trim();
    updateNicknameMutation.mutate({ userId, nickname: value === "" ? null : value.slice(0, 40) });
  };

  /** Removes the player from the SGT club and clears their local league rows. */
  const removeMemberMutation = useMutation({
    mutationFn: async (userId: number) => {
      const { data, error } = await supabase.functions.invoke("sgt-member-management", {
        body: { action: "delete-member", userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sgt-league-members"] });
      queryClient.invalidateQueries({ queryKey: ["sgt-members"] });
      setRemoveMember(null);
      toast({
        title: "Member removed",
        description: "They've been removed from the club and league standings.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to remove member",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleSaveHcp = (userId: number) => {
    const value = editHandicapValue.trim();
    if (value === "") {
      updateHcpMutation.mutate({ userId, customHcp: null });
      return;
    }
    const hcp = parseFloat(value);
    if (isNaN(hcp) || hcp < -36 || hcp > 36) {
      toast({
        title: "Invalid handicap",
        description: "Please enter a handicap between -36 and 36",
        variant: "destructive",
      });
      return;
    }
    updateHcpMutation.mutate({ userId, customHcp: hcp });
  };

  const startEditing = (member: LeagueMember) => {
    setEditingMemberId(member.user_id);
    setEditHandicapValue(member.custom_hcp?.toFixed(1) ?? "");
  };

  const cancelEditing = () => {
    setEditingMemberId(null);
    setEditHandicapValue("");
  };

  const filteredMembers = members?.filter(m => {
    const query = searchQuery.toLowerCase();
    return m.user_name?.toLowerCase().includes(query) ||
      m.nickname?.toLowerCase().includes(query) ||
      m.email?.toLowerCase().includes(query);
  });

  const formatHcp = (value: number | null) => {
    if (value === null) return ",";
    return value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
  };

  return (
    <div className="space-y-6">
      {/* Global Handicap Mode Toggle */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1 flex-1 min-w-[240px]">
              <div className="flex items-center gap-2">
                <Label htmlFor="hcp-mode-toggle" className="text-base font-semibold">
                  {`Use ${tenant.venue_name} Custom HCP (best ${BEST_ROUNDS} of ${WINDOW_ROUNDS})`}
                </Label>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <p className="font-semibold mb-1">{tenant.venue_name} Custom HCP</p>
                      <p className="text-xs">
                        Auto-calculated weekly using the <strong>best 3 of the last 6 rounds</strong>.
                        New members are <strong>locked to their onboarding handicap for their first 3 rounds</strong>,
                        after which their true handicap kicks in. They stay marked <strong>(E) exempt</strong> from
                        prizes and monthly points until their 4th round (week three).
                      </p>
                      <p className="font-semibold mt-2 mb-1">SGT Combo HCP</p>
                      <p className="text-xs">
                        Uses SGT's calculated handicap for all players. Onboarding lock is ignored.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-sm text-muted-foreground">
                {useCustomEnabled
                  ? `ON — best ${BEST_ROUNDS} of the last ${WINDOW_ROUNDS} rounds. New members locked to their onboarding HCP for their first ${ROUNDS_REQUIRED} rounds.`
                  : "OFF — players currently use SGT's combo handicap during auto-registration. Turn on to use our own handicapping system."}
              </p>

            </div>
            <Switch
              id="hcp-mode-toggle"
              checked={useCustomEnabled}
              onCheckedChange={(checked) => toggleSettingMutation.mutate(checked)}
              disabled={toggleSettingMutation.isPending}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle>League Members</CardTitle>
            </div>
            <Badge variant="secondary">
              {members?.length || 0} active
            </Badge>
          </div>
          <CardDescription>
            {useCustomEnabled
              ? "Custom HCP overrides Combo HCP. Locked members show their onboarding HCP until 3 rounds played."
              : `Toggle 'Use ${tenant.venue_name} Custom HCP' above to enable auto-recalc and manual overrides.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredMembers && filteredMembers.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-center">SGT ID</TableHead>
                    <TableHead className="text-center">Combo HCP</TableHead>
                    <TableHead className="text-center">Custom HCP</TableHead>
                    <TableHead className="text-center">Rounds</TableHead>
                    <TableHead className="text-center w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMembers.map((member) => {
                    const isEditing = editingMemberId === member.user_id;
                    const usingCustom = member.custom_hcp !== null;
                    const isLocked = useCustomEnabled && member.rounds_played < ROUNDS_REQUIRED;

                    return (
                      <TableRow key={member.user_id}>
                        <TableCell>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{member.user_name || "Unknown"}</p>
                              {member.nickname && (
                                <Badge variant="secondary" className="font-normal">
                                  {member.nickname}
                                </Badge>
                              )}
                            </div>
                            {member.email && (
                              <p className="text-xs text-muted-foreground">{member.email}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{member.user_id}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={!usingCustom && member.hcp_index !== null ? "font-semibold text-primary" : "text-muted-foreground"}>
                            {formatHcp(member.hcp_index)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {isEditing ? (
                            <Input
                              type="number"
                              step="0.1"
                              min="-36"
                              max="36"
                              value={editHandicapValue}
                              onChange={(e) => setEditHandicapValue(e.target.value)}
                              className="w-20 mx-auto text-center"
                              placeholder=","
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveHcp(member.user_id);
                                if (e.key === "Escape") cancelEditing();
                              }}
                            />
                          ) : (
                            <div className="flex items-center justify-center gap-1.5">
                              <span className={usingCustom ? "font-semibold text-primary" : "text-muted-foreground"}>
                                {formatHcp(member.custom_hcp)}
                              </span>
                              {isLocked && usingCustom && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Lock className="h-3 w-3 text-amber-500" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Locked to onboarding HCP until {ROUNDS_REQUIRED} rounds played
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {isLocked ? (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                              {member.rounds_played}/{ROUNDS_REQUIRED}
                            </Badge>
                          ) : (
                            <Badge variant={member.rounds_played >= ROUNDS_REQUIRED ? "default" : "secondary"}>
                              {member.rounds_played}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleSaveHcp(member.user_id)}
                                disabled={updateHcpMutation.isPending}
                              >
                                {updateHcpMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4 text-primary" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={cancelEditing}
                                disabled={updateHcpMutation.isPending}
                              >
                                <X className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startEditing(member)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No members found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
